/* Backend artist regression tests. Run: node scripts/test-artists.cjs
 * Executes real TypeScript route/database/helper code in a VM with a fake JSON
 * filesystem and fake image service. No HTTP server or real data/ access/writes.
 * Multer/Express plumbing and actual image processing are intentionally mocked.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const date = '2026-01-01T00:00:00.000Z'
const clone = value => JSON.parse(JSON.stringify(value))
const specs = [{ type: '折页', sequenceNumber: 1, quantity: 2, purchasePrice: 3, originalPrice: 5 }]
const product = (id, name, artist, createdAt = date) => ({
  id, name, ...(artist === undefined ? {} : { artist }),
  imagePath: `${id}.png`, thumbnailPath: `${id}_thumb.jpg`, createdAt,
})
const item = (id, productId, category = 'purchased', shopId) => ({
  id, productId, category, ...(shopId ? { shopId } : {}), specifications: clone(specs),
  ...(category === 'gift' ? { giftType: '其他', customGiftType: '自定义礼品' } : {}),
})
const order = (id, shopId, items, sequenceNumber, group = false) => ({
  id, shopId, items, sequenceNumber, orderType: group ? 'group' : 'shop',
  ...(group ? { shopIds: ['a', 'b'] } : {}), createdAt: date,
  totalAmount: 6, giftTotal: 10, smallGiftTotal: 10, giftRatio: 166.7,
})
function fixture() {
  return {
    version: '1.0', lastModified: date, nextOrderSequence: 4,
    shops: [
      { id: 'a', name: '店铺A', createdAt: date },
      { id: 'b', name: '店铺B', createdAt: date },
      { id: 'a-case', name: '店铺a', createdAt: date },
      { id: 'group', name: '拼单', createdAt: date },
    ],
    products: [
      product('a1', 'Sun', 'Alice'), product('a2', 'sUN'),
      product('b1', 'Sun', 'Bob'), product('case', 'sun', 'Case Artist'),
      product('gift', '礼品', 'Gift Artist'), product('small', '小礼物', 'Small Artist'),
      product('orphan', 'Sun', 'Orphan Artist'),
    ],
    orders: [
      order('o1', 'a', [item('i1', 'a1'), item('i2', 'gift', 'gift'), item('i3', 'small', 'smallGift')], 1),
      order('o2', 'group', [item('i4', 'a2', 'purchased', 'a'), item('i5', 'b1', 'purchased', 'b')], 2, true),
      order('o3', 'a-case', [item('i6', 'case')], 3),
    ],
    wishItems: [{
      id: 'wish', shopId: 'a', productId: 'not-a-product', productName: '心愿', artist: 'Wish Only',
      imagePath: 'wish.png', thumbnailPath: 'wish_thumb.jpg', createdAt: date,
    }],
  }
}

function sandbox(initial = fixture(), overrides = {}) {
  let serialized = JSON.stringify(initial)
  let reads = 0
  let writes = 0
  let images = 0
  let uuid = 0
  const cache = new Map()
  const handlers = new Map()
  const fakeFs = {
    async mkdir() {},
    async readFile(filename) {
      assert.equal(filename, path.join(root, 'data/db.json'), 'Only the fake DB may be read')
      reads++
      return serialized
    },
    async writeFile(filename, content) {
      assert.equal(filename, path.join(root, 'data/db.json'), 'Only the fake DB may be written')
      writes++
      serialized = content
    },
    async access() { throw new Error('No real backup files in this test') },
  }
  const imageService = {
    async saveImage(_buffer, _filename, shopName, productName) {
      images++
      return { imagePath: `${shopName}_${productName}.png`, thumbnailPath: `${shopName}_${productName}_thumb.jpg` }
    },
    async copyAndRenameImage(_filename, shopName, productName) {
      return imageService.saveImage(null, null, shopName, productName)
    },
    async deleteImage() { images++ },
    async renameImageFile() { images++; return true },
    buildImagePath(shopName, productName, ext) { return `${shopName}_${productName}${ext}` },
  }
  function load(filename) {
    filename = path.resolve(filename)
    assert.ok(filename.startsWith(path.join(root, 'server') + path.sep) ||
      ['src/types/index.ts', 'src/utils/noteHighlights.ts'].some(file => filename === path.join(root, file)),
      'Only server sources and explicitly allowed shared utilities may be loaded')
    if (cache.has(filename)) return cache.get(filename).exports
    const exported = { exports: {} }
    cache.set(filename, exported)
    const source = (overrides[filename] || fs.readFileSync(filename, 'utf8'))
      .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href))
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const routeFile = path.basename(filename, '.ts')
    const router = {}
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      router[method] = (routePath, ...callbacks) => {
        handlers.set(`${routeFile} ${method} ${routePath}`, callbacks.at(-1))
        return router
      }
    }
    const multer = Object.assign(() => ({ any: () => () => {} }), { memoryStorage: () => ({}) })
    vm.runInNewContext(compiled, {
      module: exported, exports: exported.exports, console,
      require(name) {
        if (name === 'express') return { Router: () => router }
        if (name === 'multer') return multer
        if (name === 'uuid') return { v4: () => `fake-uuid-${++uuid}` }
        if (name === 'fs/promises') return fakeFs
        if (name === 'path') return path
        if (name === 'url') return require('node:url')
        if (name === 'sharp') return () => { throw new Error('Real image processing prohibited') }
        if (name.endsWith('/imageService.js') || name === './imageService.js') return imageService
        if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name.replace(/\.js$/, '.ts')))
        throw new Error(`Unexpected module: ${name}`)
      },
    }, { filename })
    return exported.exports
  }
  load(path.join(root, 'server/routes/products.ts'))
  load(path.join(root, 'server/routes/orders.ts'))
  return {
    db: () => JSON.parse(serialized),
    reset(db = fixture()) { serialized = JSON.stringify(db) },
    service: load(path.join(root, 'server/services/database.ts')),
    helpers: load(path.join(root, 'server/services/productAssociations.ts')),
    async run(routeFile, method, routePath, { params = {}, body = {}, query = {}, files = [] } = {}) {
      reads = writes = images = 0
      let data
      let status = 200
      const response = {
        status(code) { status = code; return response },
        json(value) { data = clone(value); return response },
      }
      const handler = handlers.get(`${routeFile} ${method} ${routePath}`)
      assert.ok(handler, `Missing handler ${routeFile} ${method} ${routePath}`)
      await handler({ params, body, query, files }, response, error => { throw error })
      return { status, data, reads, writes, images }
    },
  }
}
const upload = fieldname => ({ fieldname, buffer: Buffer.from('fake image'), originalname: 'fake.png' })
const input = (name, extra = {}) => ({ productName: name, specifications: clone(specs), ...extra })
const normalBody = (purchased = [], gifts = [], small = [], shopName = '店铺A') => ({
  shopName, purchasedItems: JSON.stringify(purchased), gifts: JSON.stringify(gifts), smallGifts: JSON.stringify(small),
})
const groupBody = items => ({ shops: JSON.stringify([{ shopName: '店铺A', items }]) })
const groupPutBody = items => ({
  orderType: 'group', items: JSON.stringify(items), shopIds: JSON.stringify(['a', 'b']), shopNames: JSON.stringify({}),
})
const artistOf = (test, id) => test.db().products.find(p => p.id === id)?.artist
function assertArtists(test, ids, artist) {
  for (const id of ids) {
    const p = test.db().products.find(p => p.id === id)
    assert.ok(p, `Missing product ${id}`)
    assert.equal(p.artist, artist, `Artist of ${id}`)
    if (artist === undefined) assert.equal(Object.hasOwn(p, 'artist'), false, `Cleared field on ${id}`)
  }
}

async function patchAndSearch() {
  const test = sandbox()
  let result = await test.run('products', 'patch', '/:id/artist', { params: { id: 'a2' }, body: { artist: '  ALIce Chen  ' } })
  assert.equal(result.status, 200)
  assert.equal(result.data.artist, 'ALIce Chen')
  assert.equal(result.reads, 1)
  assert.equal(result.writes, 1)
  assertArtists(test, ['a1', 'a2'], 'ALIce Chen')
  assertArtists(test, ['b1'], 'Bob')
  assertArtists(test, ['case'], 'Case Artist')
  assertArtists(test, ['orphan'], 'Orphan Artist')
  result = await test.run('products', 'get', '/search', { query: { type: 'artist', keyword: '  ice cH  ' } })
  assert.equal(result.reads, 1)
  assert.deepEqual(result.data.map(p => p.id), ['a1'], 'Keep oldest same shop/name ID')
  assert.equal(result.data[0].shopName, '店铺A')
  for (const [keyword, expected] of [['BO', ['b1']], ['Gift Artist', ['gift']], ['Small Artist', ['small']], ['Orphan', []], ['Wish Only', []]]) {
    result = await test.run('products', 'get', '/search', { query: { type: 'artist', keyword } })
    assert.deepEqual(result.data.map(p => p.id), expected)
    assert.equal(result.reads, 1)
  }
  result = await test.run('products', 'get', '/search', { query: { type: 'artist', keyword: ' ' } })
  assert.equal(result.data.length, 4, 'Blank search returns used products with existing case-insensitive dedup')
  result = await test.run('products', 'get', '/:id', { params: { id: 'a1' } })
  assert.equal(result.data.artist, 'ALIce Chen')
  assert.equal(result.data.entries.purchased.length, 2)
  assert.equal(result.reads, 1)
  result = await test.run('products', 'get', '/search', { query: { type: 'invalid', keyword: 'Alice' } })
  assert.equal(result.status, 400)
  assert.equal(result.reads, 0)

  for (const artist of [null, 42, false, {}, [], ['Alice'], undefined]) {
    result = await test.run('products', 'patch', '/:id/artist', { params: { id: 'a1' }, body: { artist } })
    assert.equal(result.status, 400)
    assert.equal(result.reads, 0)
    assert.equal(result.writes, 0)
  }
  result = await test.run('products', 'patch', '/:id/artist', { params: { id: 'missing' }, body: { artist: 'Alice' } })
  assert.equal(result.status, 404)
  assert.equal(result.writes, 0)
  for (const id of ['a1', 'orphan']) {
    result = await test.run('products', 'patch', '/:id/artist', { params: { id }, body: { artist: ' \n\t ' } })
    assert.equal(result.status, 200)
    assert.equal(Object.hasOwn(result.data, 'artist'), false)
  }
  assertArtists(test, ['a1', 'a2', 'orphan'], undefined)
  // The same loaded modules must observe an entirely new request snapshot.
  test.reset()
  result = await test.run('products', 'get', '/search', { query: { type: 'artist', keyword: 'Alice' } })
  assert.deepEqual(result.data.map(p => p.id), ['a1'])
  console.log('PASS artist PATCH validation/sync/clear/404; artist search, old dedup and fresh snapshots')
}

async function invalidOrderArtists() {
  const test = sandbox()
  for (const artist of [null, 0, true, [], {}]) {
    for (const category of ['purchased', 'gift', 'smallGift']) {
      const arrays = { purchased: [], gift: [], smallGift: [] }
      arrays[category] = [input('Sun', { artist, existingImagePath: 'fake.png', productId: 'a1' })]
      for (const method of ['post', 'put']) {
        const result = await test.run('orders', method, method === 'post' ? '/' : '/:id', {
          params: { id: 'o1' }, body: normalBody(arrays.purchased, arrays.gift, arrays.smallGift, 'Should Not Rename'),
        })
        assert.equal(result.status, 400)
        assert.equal(result.writes, 0)
        assert.equal(result.images, 0)
      }
    }
    for (const method of ['post', 'put']) {
      const bad = input('Sun', { id: 'i4', productId: 'a2', shopId: 'a', artist })
      const result = await test.run('orders', method, method === 'post' ? '/group' : '/:id', {
        params: { id: 'o2' }, body: method === 'post' ? groupBody([bad]) : groupPutBody([bad]),
      })
      assert.equal(result.status, 400)
      assert.equal(result.writes, 0)
      assert.equal(result.images, 0)
    }
  }
  assert.deepEqual(test.db(), fixture())
  console.log('PASS illegal artist rejected before writes in ordinary POST/PUT all 3 categories and group POST/PUT')
}

async function normalOrders() {
  const test = sandbox()
  let result = await test.run('orders', 'post', '/', {
    body: normalBody(
      [input('SUN', { existingImagePath: 'a1.png' })],
      [input('sun', { artist: '  New Artist ', giftType: '其他', customGiftType: '自定义' })],
      [input('Sun', { existingImagePath: 'a1.png' })],
    ), files: [upload('giftImage_0')],
  })
  assert.equal(result.status, 201)
  assert.equal(result.data.totalAmount, 6)
  assert.equal(result.data.giftTotal, 10)
  assert.equal(result.data.smallGiftTotal, 10)
  assert.equal(result.data.giftRatio, 166.7)
  assert.equal(result.data.items[1].customGiftType, '自定义')
  assertArtists(test, ['a1', 'a2', ...result.data.items.map(i => i.productId)], 'New Artist')
  assertArtists(test, ['b1'], 'Bob')
  const firstId = result.data.id
  const oldItems = result.data.items
  result = await test.run('orders', 'get', '/:id', { params: { id: firstId } })
  assert.equal(result.reads, 1)
  for (const category of ['purchasedItems', 'gifts', 'smallGifts']) {
    assert.equal(result.data[category][0].product.artist, 'New Artist', 'Selection/detail exposes reusable artist')
  }
  result = await test.run('orders', 'put', '/:id', {
    params: { id: firstId },
    body: normalBody(...oldItems.map(i => [input('Sun', { id: i.id, productId: i.productId, giftType: '其他' })])),
  })
  assert.equal(result.status, 200)
  assertArtists(test, ['a1', 'a2', ...result.data.items.map(i => i.productId)], 'New Artist')

  // Every ordinary PUT branch, for every category: image-only, rename-only,
  // image+rename replacement, new upload; artist must survive omissions.
  for (const [category, sourceId, originalName, expected] of [
    ['purchased', 'a1', 'Sun', 'Alice'], ['gift', 'gift', '礼品', 'Gift Artist'], ['smallGift', 'small', '小礼物', 'Small Artist'],
  ]) {
    for (const mode of ['same', 'image', 'name', 'name-image', 'new']) {
      test.reset()
      const rename = mode === 'name' || mode === 'name-image'
      const data = input(rename ? `${originalName} renamed` : originalName, {
        id: `edit-${category}`, ...(mode === 'new' ? {} : { productId: sourceId }), giftType: '其他',
      })
      const arrays = { purchased: [], gift: [], smallGift: [] }
      arrays[category] = [data]
      const imageField = { purchased: 'purchasedImage_0', gift: 'giftImage_0', smallGift: 'smallGiftImage_0' }[category]
      result = await test.run('orders', 'put', '/:id', {
        params: { id: 'o1' }, body: normalBody(arrays.purchased, arrays.gift, arrays.smallGift),
        files: ['image', 'name-image', 'new'].includes(mode) ? [upload(imageField)] : [],
      })
      assert.equal(result.status, 200, `${category} ${mode}`)
      assert.equal(artistOf(test, result.data.items[0].productId), expected, `${category} ${mode} preserves/inherits artist`)
      if (mode === 'name-image' || mode === 'new') assert.notEqual(result.data.items[0].productId, sourceId)
    }
    // Explicit update/clear must also be handled independently by all categories.
    for (const artist of ['  Edited  ', '']) {
      for (const method of ['put', 'post']) {
        test.reset()
        const arrays = { purchased: [], gift: [], smallGift: [] }
        arrays[category] = [input(originalName, {
          ...(method === 'put' ? { productId: sourceId } : { existingImagePath: 'fake.png' }), artist, giftType: '其他',
        })]
        result = await test.run('orders', method, method === 'put' ? '/:id' : '/', {
          params: { id: 'o1' }, body: normalBody(arrays.purchased, arrays.gift, arrays.smallGift),
        })
        assert.equal(result.status, method === 'put' ? 200 : 201)
        assertArtists(test, [sourceId, ...result.data.items.map(i => i.productId)], artist.trim() || undefined)
        if (category === 'purchased') assertArtists(test, ['a2'], artist.trim() || undefined)
      }
    }
    // Ordinary POST omission inherits prior artist in all three categories.
    test.reset()
    const arrays = { purchased: [], gift: [], smallGift: [] }
    arrays[category] = [input(originalName, { existingImagePath: 'fake.png', giftType: '其他' })]
    result = await test.run('orders', 'post', '/', { body: normalBody(arrays.purchased, arrays.gift, arrays.smallGift) })
    assert.equal(result.status, 201)
    assert.equal(artistOf(test, result.data.items[0].productId), expected)
    assert.equal(Number.isFinite(result.data.giftRatio), true)
  }
  // Newly selected source metadata remains reusable even if the new name differs.
  test.reset()
  result = await test.run('orders', 'post', '/', {
    body: normalBody([input('Selected alias', { productId: 'a1', existingImagePath: 'a1.png' })]),
  })
  assert.equal(artistOf(test, result.data.items[0].productId), 'Alice')
  // Clear wins over omitted fields and new duplicate IDs in the same request.
  test.reset()
  result = await test.run('orders', 'post', '/', {
    body: normalBody([input('Sun', { artist: '', existingImagePath: 'fake.png' })], [input('Sun', { existingImagePath: 'fake.png' })]),
  })
  assertArtists(test, ['a1', 'a2', ...result.data.items.map(i => i.productId)], undefined)
  // Replacement-ID mapping across categories still reuses the same new Product.
  test.reset()
  result = await test.run('orders', 'put', '/:id', {
    params: { id: 'o1' },
    body: normalBody(...['purchased', 'gift', 'smallGift'].map(category => [
      input('Sun replacement', { productId: 'a1', id: `mapping-${category}`, giftType: '其他' }),
    ])), files: [upload('purchasedImage_0')],
  })
  assert.equal(result.status, 200)
  assert.equal(new Set(result.data.items.map(i => i.productId)).size, 1)
  assertArtists(test, result.data.items.map(i => i.productId), 'Alice')
  // Fresh unnamed-artist products stay optional, without inheriting an orphan.
  test.reset()
  result = await test.run('orders', 'post', '/', {
    body: normalBody([input('Brand new', { existingImagePath: 'fake.png' })]),
  })
  assertArtists(test, result.data.items.map(i => i.productId), undefined)
  console.log('PASS ordinary POST/PUT artists in all 3 categories, every edit/image branch, source reuse, inheritance and totals')
}

async function groupOrders() {
  const test = sandbox()
  let result = await test.run('orders', 'post', '/group', {
    body: groupBody([
      input('sun', { productId: 'a2' }),
      input('SUN', { existingImagePath: 'a1.png', artist: '  Group Artist  ' }),
      input('Sun'),
    ]),
  })
  assert.equal(result.status, 201)
  assert.equal(result.data.orderType, 'group')
  assert.deepEqual(result.data.shopIds, ['a'])
  assert.equal(result.data.items[0].productId, 'a2')
  assert.equal(result.data.totalAmount, 18)
  assert.equal(result.data.items.every(i => i.shopId === 'a'), true)
  assertArtists(test, ['a1', 'a2', ...result.data.items.map(i => i.productId)], 'Group Artist')
  assertArtists(test, ['b1'], 'Bob')

  test.reset()
  result = await test.run('orders', 'post', '/group', {
    body: { shops: JSON.stringify([{ shopName: 'New shop', items: [input('Sun')] }]) },
  })
  assert.equal(result.status, 400, 'Cannot accidentally reuse another shop\'s namesake and artist')
  test.reset()
  result = await test.run('orders', 'post', '/group', {
    body: groupBody([input('Sun'), input('new same request', { artist: ' New ' }), input('new same request')]),
    files: [upload('shop0_item1')],
  })
  assert.equal(result.status, 201)
  assert.equal(artistOf(test, result.data.items[0].productId), 'Alice')
  assert.equal(result.data.items[1].productId, result.data.items[2].productId)
  assert.equal(artistOf(test, result.data.items[1].productId), 'New')

  for (const mode of ['same', 'image', 'name', 'name-image', 'new']) {
    test.reset()
    const rename = mode === 'name' || mode === 'name-image'
    const data = input(rename ? 'Sun renamed' : 'Sun', {
      id: mode === 'new' ? 'temp_new' : 'i4', shopId: 'a', ...(mode === 'new' ? {} : { productId: 'a2' }),
    })
    // a2 has no artist in old data: image+name replacements can only preserve
    // source info already entered; use a1 for this branch to test preservation.
    if (mode === 'name-image' || mode === 'name') data.productId = 'a1'
    result = await test.run('orders', 'put', '/:id', {
      params: { id: 'o2' }, body: groupPutBody([data]),
      files: ['image', 'name-image', 'new'].includes(mode) ? [upload(`item_${data.id}`)] : [],
    })
    assert.equal(result.status, 200, mode)
    assert.equal(artistOf(test, result.data.items[0].productId), 'Alice', `Group ${mode} preserves/inherits`)
    assert.equal(result.data.items[0].shopId, 'a')
    assert.deepEqual(result.data.shopIds, ['a', 'b'])
  }
  for (const artist of [' Group Edit ', '']) {
    test.reset()
    result = await test.run('orders', 'put', '/:id', {
      params: { id: 'o2' }, body: groupPutBody([
        input('Sun', { id: 'i4', productId: 'a2', shopId: 'a', artist }),
        input('Sun', { id: 'i5', productId: 'b1', shopId: 'b' }),
      ]),
    })
    assert.equal(result.status, 200)
    assertArtists(test, ['a1', 'a2'], artist.trim() || undefined)
    assertArtists(test, ['b1'], 'Bob')
  }
  // Renaming a shop must preserve the products/artist relation for later inheritance.
  test.reset()
  const body = groupPutBody([input('Sun', { id: 'i4', productId: 'a2', shopId: 'a' })])
  body.shopNames = JSON.stringify({ a: 'Renamed shop' })
  result = await test.run('orders', 'put', '/:id', { params: { id: 'o2' }, body })
  assert.equal(result.status, 200)
  assertArtists(test, ['a1', 'a2'], 'Alice')
  console.log('PASS group POST/PUT all edit/image branches, same-shop reuse, shop rename, inheritance and clear')
}

async function exactMetadataSearch() {
  const db = fixture()
  db.shops.push({ id: 'exact-shop', name: '店铺 & A?', createdAt: date }, { id: 'prefix-shop', name: '店铺 & A? Plus', createdAt: date })
  db.products.push(product('exact-product', '精确名称商品', 'Painter & A?'), product('prefix-product', '相似名称商品', 'Painter & A? Team'))
  db.orders.push(order('exact-order', 'exact-shop', [item('exact-item', 'exact-product')], 4), order('prefix-order', 'prefix-shop', [item('prefix-item', 'prefix-product')], 5))
  db.nextOrderSequence = 6
  const test = sandbox(db)
  for (const [type, keyword] of [['shopName', ' 店铺 & A? '], ['artist', ' painter & a? ']]) {
    const partial = await test.run('products', 'get', '/search', { query: { type, keyword } })
    const exact = await test.run('products', 'get', '/search', { query: { type, keyword, exact: 'true' } })
    assert.deepEqual(partial.data.map(product => product.id), ['exact-product', 'prefix-product'])
    assert.deepEqual(exact.data.map(product => product.id), ['exact-product'])
    assert.equal(exact.reads, 1)
    assert.equal(exact.writes, 0)
  }
  console.log('PASS exact shop/artist matching excludes prefixed names; default search keeps substring matching')
}

async function readRegression() {
  const sources = Object.fromEntries(['server/routes/products.ts', 'server/routes/orders.ts', 'server/services/database.ts'].map(file => {
    return [path.join(root, file), execFileSync('git', ['show', `fd53cc0:${file}`], { cwd: root, encoding: 'utf8' })]
  }))
  const db = fixture()
  // Preserve detail behavior for unresolved first shop, duplicate occurrences,
  // repeated categories, missing Product references and case-sensitive shop names.
  db.orders[0].items.push(item('repeat', 'a1', 'gift'), item('missing', 'does-not-exist'))
  db.orders.unshift(order('unknown', 'missing-shop', [item('unknown-ref', 'a2')], 4))
  db.nextOrderSequence = 5
  const before = sandbox(db, sources)
  const after = sandbox(db)
  for (const [file, routePath, params, query = {}] of [
    ['products', '/:id', { id: 'a1' }], ['products', '/:id', { id: 'a2' }],
    ['products', '/:id', { id: 'orphan' }], ['products', '/:id', { id: 'missing' }],
    ['products', '/set-products', {}], ['products', '/loose-items', {}],
    ['orders', '/', {}], ['orders', '/:id', { id: 'o1' }], ['orders', '/:id', { id: 'o2' }],
    ['products', '/search', {}, { type: 'productName', keyword: '' }],
    ['products', '/search', {}, { type: 'productName', keyword: ' sUN ' }],
    ['products', '/search', {}, { type: 'shopName', keyword: ' 店铺A ' }],
    ['products', '/search', {}, { type: 'shopName', keyword: '店铺b' }],
  ]) {
    const expected = await before.run(file, 'get', routePath, { params, query })
    const actual = await after.run(file, 'get', routePath, { params, query })
    assert.equal(actual.status, expected.status)
    assert.deepEqual(actual.data, expected.data, `${file} ${routePath} ${JSON.stringify(params)} remains unchanged`)
    assert.equal(actual.reads, 1, 'Read-only route keeps one database snapshot')
  }
  console.log('PASS unchanged detail/Set/loose/order/search GET results vs fd53cc0; one snapshot per read route')
}

;(async () => {
  await patchAndSearch()
  await invalidOrderArtists()
  await normalOrders()
  await groupOrders()
  await exactMetadataSearch()
  await readRegression()
  console.log('All artist backend regressions passed (synthetic data only).')
})().catch(error => { console.error(error); process.exitCode = 1 })
