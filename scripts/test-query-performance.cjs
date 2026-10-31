/* Regression/performance test: route handlers with synthetic database snapshots.
 * No server, filesystem database or real user data is used.
 * Run: node scripts/test-query-performance.cjs
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { execFileSync } = require('node:child_process')
const { performance } = require('node:perf_hooks')
const ts = require('typescript')

const fixture = {
  version: '1.0', lastModified: '2026-01-01', nextOrderSequence: 121,
  shops: [{ id: 'shop-a', name: '店铺A' }, { id: 'shop-b', name: '店铺B' }],
  products: Array.from({ length: 180 }, (_, i) => ({
    id: `p${i}`, name: `商品${i % 60}`, imagePath: `${i}.png`, thumbnailPath: `${i}.jpg`, createdAt: '2026-01-01',
  })),
  orders: Array.from({ length: 120 }, (_, i) => ({
    id: `o${i}`, sequenceNumber: i + 1, createdAt: `2026-01-${String(i % 28 + 1).padStart(2, '0')}`,
    ...(i % 3 === 0 ? { orderType: 'group', shopIds: ['shop-a', 'shop-b'] } : {}),
    shopId: 'shop-a', totalAmount: i, giftRatio: 0, smallGiftTotal: 0,
    items: Array.from({ length: 6 }, (_, j) => ({
      id: `i${i}-${j}`, productId: `p${(i * 6 + j) % 180}`, shopId: j % 2 ? 'shop-a' : 'shop-b',
      category: ['purchased', 'gift', 'smallGift'][j % 3], giftType: '其他', arrived: i % 2 === 0,
      specifications: [
        { type: '大食量set', sequenceNumber: 1, quantity: j + 1, purchasePrice: 10, originalPrice: 20 },
        { type: '折页', sequenceNumber: 1, quantity: j, originalPrice: 1 },
        { type: '卡头', sequenceNumber: 2, quantity: 0, originalPrice: 1 },
        { type: '其他贴纸', customType: '名称_含下划线', sequenceNumber: 2, quantity: 1, originalPrice: 1 },
      ],
    })),
  })),
}
fixture.orders[1].items.push({ productId: 'missing', category: 'purchased', specifications: [] })
const serialized = JSON.stringify(fixture)
const typesModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/types/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: typesModule, exports: typesModule.exports })
const associationsModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/services/productAssociations.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: associationsModule, exports: associationsModule.exports,
  require(name) {
    if (name === '../../src/types/index.js') return typesModule.exports
    throw new Error(`Unexpected association dependency ${name}`)
  },
})

const relationsModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/services/productRelations.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: relationsModule, exports: relationsModule.exports,
  require(name) {
    if (name === './productAssociations.js') return associationsModule.exports
    throw new Error(`Unexpected relation dependency ${name}`)
  },
})

function loadHandlers(source, filename) {
  const handlers = new Map()
  let reads = 0
  const loadDatabase = async () => { reads++; return JSON.parse(serialized) }
  const database = {
    DATA_DIR: 'UNUSED_SYNTHETIC_DATA', loadDatabase,
    getProductById: async id => (await loadDatabase()).products.find(p => p.id === id),
    getAllProducts: async () => (await loadDatabase()).products,
    getAllShops: async () => (await loadDatabase()).shops,
    getShopById: async id => (await loadDatabase()).shops.find(shop => shop.id === id),
    getOrderById: async (id, snapshot) => {
      const order = (snapshot || await loadDatabase()).orders.find(order => order.id === id)
      return order && { ...order, giftTotal: order.giftTotal ?? 0, orderType: order.orderType || 'shop' }
    },
    getAllOrders: async (sortBy, direction, snapshot) => {
      const orders = (snapshot || await loadDatabase()).orders.map(order => ({
        ...order, orderType: order.orderType || 'shop', giftTotal: order.giftTotal ?? 0,
      }))
      return sortBy ? orders.sort((a, b) => direction === 'desc' ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy]) : orders
    },
  }
  const router = {}
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (path, ...callbacks) => { handlers.set(`${method} ${path}`, callbacks.at(-1)); return router }
  }
  const upload = { any: () => () => {} }
  const multer = Object.assign(() => upload, { memoryStorage: () => ({}) })
  const modules = { express: { Router: () => router }, multer, uuid: { v4: () => 'unused' } }
  const exported = { exports: {} }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(compiled, {
    module: exported, exports: exported.exports,
    require(name) {
      if (name.includes('services/database')) return database
      if (name.includes('services/productAssociations')) return associationsModule.exports
      if (name.includes('services/productRelations')) return relationsModule.exports
      if (name.includes('services/imageResolution')) return { selectImagesForSnapshot: () => async () => undefined }
      if (name.includes('services/imageService')) return {}
      if (name === 'sharp') return () => { throw new Error('Image writes are not permitted in this test') }
      if (name === 'fs/promises') return {}
      if (name === 'path') return require('node:path')
      if (modules[name]) return modules[name]
      throw new Error(`Unexpected module ${name}`)
    },
  }, { filename })
  return {
    async run(path, params = {}, query = {}) {
      reads = 0
      let result
      let status = 200
      const response = { status(code) { status = code; return response }, json(data) { result = data; return response } }
      const start = performance.now()
      await handlers.get(`get ${path}`)({ params, query }, response, error => { throw error })
      return { data: JSON.parse(JSON.stringify(result)), status, reads, ms: performance.now() - start }
    },
  }
}

;(async () => {
  for (const [file, cases] of [
    ['server/routes/products.ts', [['/set-products'], ['/loose-items'], ['/:id', { id: 'p0' }], ['/:id', { id: 'missing' }]]],
    ['server/routes/orders.ts', [['/', {}, { sortBy: 'totalAmount', order: 'desc' }], ['/:id', { id: 'o0' }], ['/:id', { id: 'o1' }]]],
  ]) {
    const baseline = loadHandlers(execFileSync('git', ['show', `b7e1edd:${file}`], { encoding: 'utf8' }), file)
    const current = loadHandlers(fs.readFileSync(file, 'utf8'), file)
    for (const args of cases) {
      const before = await baseline.run(...args)
      const after = await current.run(...args)
      assert.equal(after.status, before.status)
      assert.deepEqual(after.data, before.data)
      assert.equal(after.reads, 1, `Expected exactly one snapshot for ${file} ${args[0]}`)
      console.log(`PASS ${file} ${args[0]} ${JSON.stringify(args[1] || {})}: snapshots ${before.reads} → ${after.reads}; synthetic JSON-read time ${before.ms.toFixed(1)}ms → ${after.ms.toFixed(1)}ms`)
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
