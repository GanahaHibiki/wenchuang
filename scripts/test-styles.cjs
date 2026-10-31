/* Run: node scripts/test-styles.cjs
 * Real server code in VM + the existing artist fake-FS/image harness.
 * No HTTP server, real data/ or external files. Existing tests are read-only;
 * their VM module mocks are extended in memory for PRODUCT_STYLES only.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const STYLES = ['食物系', '盐系', '可爱系', '花卉系', '复古系', '其他']
const exportedTypes = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/types/index.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: exportedTypes, exports: exportedTypes.exports })
const sharedTypes = exportedTypes.exports
assert.deepEqual(Array.from(sharedTypes.PRODUCT_STYLES), STYLES, 'Shared style contract')

const artistSource = fs.readFileSync(path.join(root, 'scripts/test-artists.cjs'), 'utf8')
const artistMockAnchor = "if (name === 'express') return { Router: () => router }"
assert.ok(artistSource.includes(artistMockAnchor))
const patchedArtistSource = artistSource.replace(artistMockAnchor,
  `if (name === '../../src/types/index.js') return sharedTypes\n        ${artistMockAnchor}`)
function context(filename) {
  return { require, console, Buffer, process, __dirname: path.dirname(filename), sharedTypes, module: { exports: {} } }
}
const harnessContext = context(path.join(root, 'scripts/test-artists.cjs'))
vm.runInNewContext(patchedArtistSource.slice(0, patchedArtistSource.indexOf(';(async () => {')) +
  '\nmodule.exports = { sandbox, fixture, upload, input, normalBody, groupBody, groupPutBody };', harnessContext)
const { sandbox: rawSandbox, fixture: rawArtistFixture, upload, input, normalBody, groupBody, groupPutBody } = harnessContext.module.exports
const clone = value => JSON.parse(JSON.stringify(value))
const artistFixture = () => clone(rawArtistFixture())
function sandbox(...args) {
  const test = rawSandbox(...args)
  return {
    ...test,
    db: () => clone(test.db()),
    run: async (...params) => clone(await test.run(...params)),
    service: {
      ...test.service,
      searchProducts: async (...params) => clone(await test.service.searchProducts(...params)),
    },
  }
}
function fixture() {
  const db = artistFixture()
  const styles = { a1: '食物系', b1: '盐系', case: '复古系', gift: '花卉系', small: '其他', orphan: '可爱系' }
  for (const product of db.products) if (styles[product.id]) product.style = styles[product.id]
  return db
}
const productOf = (test, id) => test.db().products.find(p => p.id === id)
function assertStyles(test, ids, style) {
  for (const id of ids) {
    const product = productOf(test, id)
    assert.ok(product, `Missing ${id}`)
    assert.equal(product.style, style, `Style of ${id}`)
    if (style === undefined) assert.equal(Object.hasOwn(product, 'style'), false, `Deleted field on ${id}`)
  }
}
const unchangedArtists = (before, after) => {
  for (const product of before.products) assert.equal(after.products.find(p => p.id === product.id).artist, product.artist)
}
const arraysFor = (category, values) => ['purchased', 'gift', 'smallGift'].map(c => c === category ? values : [])
const imageField = category => ({ purchased: 'purchasedImage_0', gift: 'giftImage_0', smallGift: 'smallGiftImage_0' }[category])

async function patchAndValidation() {
  const test = sandbox(fixture())
  assert.equal(test.helpers.hasInvalidStyles([{}]), false)
  assert.equal(test.helpers.hasInvalidStyles([{ style: undefined }]), true)
  assert.equal(Object.hasOwn(test.helpers.orderArtistInput('id', {}), 'style'), false)
  assert.equal(test.helpers.orderArtistInput('id', { style: '' }).style, '')
  for (const style of STYLES) {
    assert.equal(test.helpers.isValidProductStyle(style), true)
    const before = test.db()
    const result = await test.run('products', 'patch', '/:id/style', { params: { id: 'a2' }, body: { style } })
    assert.equal(result.status, 200)
    assert.equal(result.data.style, style)
    assert.equal(result.reads, 1)
    assert.equal(result.writes, 1)
    assertStyles(test, ['a1', 'a2'], style)
    assertStyles(test, ['b1'], '盐系')
    assertStyles(test, ['case'], '复古系')
    assertStyles(test, ['orphan'], '可爱系')
    unchangedArtists(before, test.db())
  }
  const invalid = [undefined, null, 42, false, {}, [], ['食物系'], '未分类', 'food', ' 食物系 ', ' ', '食物系\n']
  for (const style of invalid) {
    assert.equal(test.helpers.isValidStyle(style), false)
    const result = await test.run('products', 'patch', '/:id/style', { params: { id: 'a1' }, body: { style } })
    assert.equal(result.status, 400)
    assert.equal(result.reads + result.writes + result.images, 0)
  }
  const missingBody = await test.run('products', 'patch', '/:id/style', { params: { id: 'a1' } })
  assert.equal(missingBody.status, 400)
  const missing = await test.run('products', 'patch', '/:id/style', { params: { id: 'missing' }, body: { style: '其他' } })
  assert.equal(missing.status, 404)
  assert.equal(missing.writes, 0)
  for (const id of ['a1', 'orphan']) {
    const result = await test.run('products', 'patch', '/:id/style', { params: { id }, body: { style: '' } })
    assert.equal(result.status, 200)
    assert.equal(Object.hasOwn(result.data, 'style'), false)
  }
  assertStyles(test, ['a1', 'a2', 'orphan'], undefined)
  test.reset(fixture())
  await test.run('products', 'patch', '/:id/artist', { params: { id: 'a1' }, body: { artist: '' } })
  assertStyles(test, ['a1'], '食物系')
  assertStyles(test, ['a2'], undefined)
  console.log('PASS six enum values; PATCH validation/404/same-shop sync/clear; artist independence')
}

async function searchAndReads() {
  const db = fixture()
  const date = '2026-02-01T00:00:00.000Z'
  db.shops.push({ id: 'prefix-shop', name: '店铺A Plus', createdAt: date })
  const add = (id, name, artist, style, shopId = 'prefix-shop') => {
    db.products.push({ id, name, artist, ...(style ? { style } : {}), imagePath: `${id}.png`, thumbnailPath: `${id}.jpg`, createdAt: date })
    db.orders.push({ ...clone(db.orders[0]), id: `${id}-order`, shopId, items: [{ ...clone(db.orders[0].items[0]), id: `${id}-item`, productId: id }], sequenceNumber: db.orders.length + 1, createdAt: date })
  }
  add('prefix', 'Sun Plus', 'Alice Team', '食物系')
  add('exact', ' Sun ', ' Alice ', '食物系')
  add('unclassified', 'No style', 'Alice', undefined)
  // The oldest namesake is unclassified; style filtering precedes dedup.
  db.products.find(p => p.id === 'a2').style = '可爱系'
  db.products.find(p => p.id === 'a2').artist = 'Alice'
  db.nextOrderSequence = db.orders.length + 1
  const test = sandbox(db)
  const cases = [
    [{ style: '食物系' }, ['prefix', 'exact', 'a1']],
    [{ type: 'artist', keyword: ' ALIce ', style: '食物系' }, ['prefix', 'exact', 'a1']],
    [{ type: 'artist', keyword: ' ALIce ', exact: 'true', style: '食物系' }, ['exact', 'a1']],
    [{ type: 'shopName', keyword: '店铺A', style: '食物系' }, ['prefix', 'exact', 'a1']],
    [{ type: 'shopName', keyword: ' 店铺A ', exact: 'true', style: '食物系' }, ['a1']],
    [{ type: 'productName', keyword: ' sUN ', style: '食物系' }, ['prefix', 'exact', 'a1']],
    [{ type: 'productName', keyword: ' sUN ', exact: 'true', style: '食物系' }, ['exact', 'a1']],
    [{ type: 'artist', keyword: 'Alice', style: '盐系' }, []],
    [{ type: 'shopName', keyword: '店铺B', style: '盐系' }, ['b1']],
    [{ keyword: 'sun', style: '可爱系' }, ['a2']],
    [{ keyword: ' ', style: '其他' }, ['small']],
    [{ keyword: 'No style', style: '其他' }, []],
  ]
  for (const [query, expected] of cases) {
    const result = await test.run('products', 'get', '/search', { query })
    assert.equal(result.status, 200)
    assert.deepEqual(result.data.map(p => p.id), expected, JSON.stringify(query))
    assert.equal(result.reads, 1)
    assert.equal(result.writes, 0)
  }
  assert.deepEqual((await test.service.searchProducts('artist', 'Alice', true, '食物系')).map(p => p.id), ['exact', 'a1'])
  for (const style of ['', '未分类', '食物系 ', ['其他'], {}, null]) {
    const result = await test.run('products', 'get', '/search', { query: { style } })
    assert.equal(result.status, 400)
    assert.equal(result.reads + result.writes, 0)
  }
  test.reset(fixture())
  const fresh = await test.run('products', 'get', '/search', { query: { style: '食物系' } })
  assert.deepEqual(fresh.data.map(p => p.id), ['a1'], 'No cross-request cache')

  // Compare current no-style GET results to pre-task server sources, including legacy data.
  const baselineSources = Object.fromEntries(['server/routes/products.ts', 'server/routes/orders.ts', 'server/services/database.ts', 'server/services/productAssociations.ts'].map(file =>
    [path.join(root, file), execFileSync('git', ['show', `f9a7a59:${file}`], { cwd: root, encoding: 'utf8' })]))
  for (const initial of [artistFixture(), fixture()]) {
    const before = sandbox(initial, baselineSources)
    const after = sandbox(initial)
    for (const [file, routePath, params = {}, query = {}] of [
      ['products', '/'], ['products', '/:id', { id: 'a1' }], ['products', '/:id', { id: 'a2' }],
      ['products', '/:id', { id: 'missing' }], ['products', '/set-products'], ['products', '/loose-items'],
      ['orders', '/'], ['orders', '/:id', { id: 'o1' }], ['orders', '/:id', { id: 'o2' }],
      ...['productName', 'shopName', 'artist'].flatMap(type => ['', 'Sun', '店铺A', 'Alice'].flatMap(keyword => [undefined, 'true'].map(exact =>
        ['products', '/search', {}, { type, keyword, ...(exact ? { exact } : {}) }]))),
    ]) {
      const expected = await before.run(file, 'get', routePath, { params, query })
      const actual = await after.run(file, 'get', routePath, { params, query })
      assert.equal(actual.status, expected.status)
      assert.deepEqual(actual.data, expected.data, `${file} ${routePath} no-style regression`)
      assert.equal(actual.reads, 1)
      assert.equal(actual.writes, 0)
    }
  }
  const detail = await test.run('orders', 'get', '/:id', { params: { id: 'o1' } })
  assert.equal(detail.data.purchasedItems[0].product.style, '食物系')
  console.log('PASS AND/exact artist/shop/product searches; unclassified != 其他; dedup/order/old data unchanged; single-snapshot GET')
}

async function invalidOrders() {
  const test = sandbox(fixture())
  for (const style of [null, 1, false, [], {}, 'bad', ' ', ' 食物系']) {
    for (const category of ['purchased', 'gift', 'smallGift']) {
      const entries = arraysFor(category, [input('Sun', { productId: 'a1', existingImagePath: 'fake.png', style })])
      for (const method of ['post', 'put']) {
        const result = await test.run('orders', method, method === 'post' ? '/' : '/:id', {
          params: { id: 'o1' }, body: normalBody(...entries, 'Do Not Rename'), files: [upload(imageField(category))],
        })
        assert.equal(result.status, 400)
        assert.equal(result.writes + result.images, 0)
      }
    }
    for (const method of ['post', 'put']) {
      const data = input('Sun', { id: 'i4', productId: 'a2', shopId: 'a', style })
      const body = method === 'post' ? groupBody([data]) : groupPutBody([data])
      if (method === 'put') body.shopNames = JSON.stringify({ a: 'Do Not Rename' })
      const result = await test.run('orders', method, method === 'post' ? '/group' : '/:id', { params: { id: 'o2' }, body, files: [upload('item_i4')] })
      assert.equal(result.status, 400)
      assert.equal(result.writes + result.images, 0)
    }
  }
  assert.deepEqual(test.db(), fixture())
  console.log('PASS invalid styles rejected before image/shop writes in every POST/PUT category/group')
}

async function ordinaryOrders() {
  const test = sandbox(fixture())
  for (const [category, sourceId, name, style] of [
    ['purchased', 'a1', 'Sun', '食物系'], ['gift', 'gift', '礼品', '花卉系'], ['smallGift', 'small', '小礼物', '其他'],
  ]) {
    for (const mode of ['same', 'image', 'name', 'name-image', 'new']) {
      for (const explicit of [undefined, '可爱系', '']) {
        test.reset(fixture())
        const data = input(mode.startsWith('name') ? `${name} renamed` : name, {
          id: `edit-${category}`, ...(mode === 'new' ? {} : { productId: sourceId }), giftType: '其他',
          ...(explicit === undefined ? {} : { style: explicit }),
        })
        const result = await test.run('orders', 'put', '/:id', {
          params: { id: 'o1' }, body: normalBody(...arraysFor(category, [data])),
          files: ['image', 'name-image', 'new'].includes(mode) ? [upload(imageField(category))] : [],
        })
        assert.equal(result.status, 200, `${category}/${mode}/${explicit}`)
        assertStyles(test, result.data.items.map(i => i.productId), explicit === undefined ? style : explicit || undefined)
        assert.equal(productOf(test, result.data.items[0].productId).artist, productOf(sandbox(fixture()), sourceId).artist)
        assert.equal(result.data.totalAmount, category === 'purchased' ? 6 : 0)
        assert.equal(result.data.giftTotal, category === 'gift' ? 10 : 0)
        assert.equal(result.data.smallGiftTotal, category === 'smallGift' ? 10 : 0)
        assert.equal(result.data.giftRatio, 0)
        assertStyles(test, ['b1'], '盐系')
        if (mode === 'name-image' || mode === 'new') assert.notEqual(result.data.items[0].productId, sourceId)
      }
    }
    for (const mode of ['copy', 'upload']) {
      for (const explicit of [undefined, ...STYLES, '']) {
        test.reset(fixture())
        const data = input(name, { existingImagePath: 'fake.png', giftType: '其他', ...(explicit === undefined ? {} : { style: explicit }) })
        const result = await test.run('orders', 'post', '/', {
          body: normalBody(...arraysFor(category, [data])), files: mode === 'upload' ? [upload(imageField(category))] : [],
        })
        assert.equal(result.status, 201)
        assertStyles(test, [sourceId, ...result.data.items.map(i => i.productId)], explicit === undefined ? style : explicit || undefined)
        assertStyles(test, ['b1'], '盐系')
      }
    }
  }
  test.reset(fixture())
  let result = await test.run('orders', 'post', '/', { body: normalBody(
    [input('SUN', { existingImagePath: 'fake.png', style: '盐系', artist: ' New Artist ' })],
    [input('sun', { existingImagePath: 'fake.png', style: '', giftType: '其他' })],
    [input('Sun', { existingImagePath: 'fake.png', style: '可爱系', artist: '' }), input('Sun', { existingImagePath: 'fake.png' })],
  ) })
  assert.equal(result.status, 201)
  assertStyles(test, ['a1', 'a2', ...result.data.items.map(i => i.productId)], '可爱系')
  for (const id of ['a1', 'a2', ...result.data.items.map(i => i.productId)]) assert.equal(Object.hasOwn(productOf(test, id), 'artist'), false)
  assert.equal(result.data.totalAmount, 6)
  assert.equal(result.data.giftTotal, 10)
  assert.equal(result.data.smallGiftTotal, 20)
  assert.equal(result.data.giftRatio, 333.3)
  test.reset(fixture())
  result = await test.run('orders', 'post', '/', { body: normalBody(
    [input('Sun', { existingImagePath: 'fake.png', style: '' })], [input('Sun', { existingImagePath: 'fake.png' })],
  ) })
  assertStyles(test, ['a1', 'a2', ...result.data.items.map(i => i.productId)], undefined)
  test.reset(fixture())
  result = await test.run('orders', 'post', '/', { body: normalBody([input('Selected alias', { productId: 'a1', existingImagePath: 'fake.png' })]) })
  assertStyles(test, result.data.items.map(i => i.productId), '食物系')
  test.reset(fixture())
  result = await test.run('orders', 'put', '/:id', {
    params: { id: 'o1' }, body: normalBody(...['purchased', 'gift', 'smallGift'].map(category => [input('Replacement', { id: `mapping-${category}`, productId: 'a1', giftType: '其他', ...(category === 'gift' ? { artist: '' } : {}), ...(category === 'smallGift' ? { style: '复古系' } : {}) })])),
    files: [upload('purchasedImage_0')],
  })
  assert.equal(new Set(result.data.items.map(i => i.productId)).size, 1)
  assertStyles(test, result.data.items.map(i => i.productId), '复古系')
  assert.equal(productOf(test, result.data.items[0].productId).artist, undefined)
  test.reset(fixture())
  result = await test.run('orders', 'put', '/:id', {
    params: { id: 'o1' }, body: normalBody(
      [input('Sun', { id: 'i1', productId: 'a1', style: '复古系', artist: ' Changed ' })],
      [input('sun', { id: 'duplicate', productId: 'a2', style: '' })],
      [input('Sun', { id: 'omitted', productId: 'a1' })],
    ),
  })
  assert.equal(result.status, 200)
  assertStyles(test, ['a1', 'a2'], undefined)
  assert.equal(productOf(test, 'a1').artist, 'Changed', 'Style clear does not clear artist')
  assert.equal(result.data.giftRatio, 166.7)
  test.reset(fixture())
  result = await test.run('orders', 'put', '/:id', {
    params: { id: 'o1' }, body: normalBody([input('Sun', { id: 'i1', productId: 'a1', artist: '' })]),
  })
  assertStyles(test, ['a1', 'a2'], '食物系')
  test.reset(artistFixture())
  result = await test.run('orders', 'post', '/', { body: normalBody([input('Brand new', { existingImagePath: 'fake.png' })]) })
  assertStyles(test, result.data.items.map(i => i.productId), undefined)
  console.log('PASS ordinary POST/PUT all categories and image/rename/new/selection/mapping branches; explicit/clear/omit/last wins; artist/totals intact')
}

async function groupOrders() {
  const test = sandbox(fixture())
  for (const mode of ['reuse', 'copy', 'upload']) {
    for (const explicit of [undefined, ...STYLES, '']) {
      test.reset(fixture())
      const data = input('Sun', { productId: 'a2', ...(mode === 'copy' ? { existingImagePath: 'fake.png' } : {}), ...(explicit === undefined ? {} : { style: explicit }) })
      const result = await test.run('orders', 'post', '/group', { body: groupBody([data]), files: mode === 'upload' ? [upload('shop0_item0')] : [] })
      assert.equal(result.status, 201)
      assertStyles(test, ['a1', 'a2', ...result.data.items.map(i => i.productId)], explicit === undefined ? '食物系' : explicit || undefined)
      assertStyles(test, ['b1'], '盐系')
      assert.deepEqual(result.data.shopIds, ['a'])
      assert.equal(result.data.items[0].shopId, 'a')
      assert.equal(result.data.totalAmount, 6)
    }
  }
  for (const mode of ['same', 'image', 'name', 'name-image', 'new']) {
    for (const explicit of [undefined, '花卉系', '']) {
      test.reset(fixture())
      const data = input(mode.startsWith('name') ? 'Sun renamed' : 'Sun', { id: mode === 'new' ? 'temp_new' : 'i4', shopId: 'a', ...(mode === 'new' ? {} : { productId: 'a1' }), ...(explicit === undefined ? {} : { style: explicit }) })
      const result = await test.run('orders', 'put', '/:id', { params: { id: 'o2' }, body: groupPutBody([data, input('Sun', { id: 'i5', productId: 'b1', shopId: 'b' })]), files: ['image', 'name-image', 'new'].includes(mode) ? [upload(`item_${data.id}`)] : [] })
      assert.equal(result.status, 200)
      assertStyles(test, [result.data.items[0].productId], explicit === undefined ? '食物系' : explicit || undefined)
      assertStyles(test, ['b1'], '盐系')
      assert.deepEqual(result.data.shopIds, ['a', 'b'])
      assert.equal(result.data.items[0].shopId, 'a')
      assert.equal(result.data.totalAmount, 12)
      assert.equal(result.data.giftTotal + result.data.smallGiftTotal + result.data.giftRatio, 0)
      assert.equal(productOf(test, result.data.items[0].productId).artist, 'Alice')
    }
  }
  test.reset(fixture())
  let result = await test.run('orders', 'post', '/group', {
    body: groupBody([input('Brand new', { style: '盐系', artist: ' New ' }), input('brand NEW', { style: '', artist: '' }), input('Brand new')]),
    files: [upload('shop0_item0')],
  })
  assert.equal(result.status, 201)
  assert.equal(new Set(result.data.items.map(i => i.productId)).size, 1, 'Request-local index reused')
  assertStyles(test, result.data.items.map(i => i.productId), undefined)
  assert.equal(productOf(test, result.data.items[0].productId).artist, undefined)
  test.reset(fixture())
  result = await test.run('orders', 'put', '/:id', { params: { id: 'o2' }, body: groupPutBody([
    input('Sun', { id: 'i4', productId: 'a1', shopId: 'a', style: '盐系', artist: '' }),
    input('sun', { id: 'extra', productId: 'a2', shopId: 'a', style: '复古系' }),
    input('Sun', { id: 'i5', productId: 'b1', shopId: 'b', artist: ' Changed ' }),
  ]) })
  assertStyles(test, ['a1', 'a2'], '复古系')
  assertStyles(test, ['b1'], '盐系')
  assert.equal(productOf(test, 'a1').artist, undefined)
  assert.equal(productOf(test, 'b1').artist, 'Changed')
  test.reset(fixture())
  result = await test.run('orders', 'post', '/group', {
    body: { shops: JSON.stringify([
      { shopName: '店铺A', items: [input('Sun', { style: '可爱系' }), input('Sun')] },
      { shopName: '店铺B', items: [input('Sun', { style: '复古系' })] },
    ]) },
  })
  assert.equal(result.status, 201)
  assert.deepEqual(result.data.shopIds, ['a', 'b'])
  assertStyles(test, ['a1', 'a2'], '可爱系')
  assertStyles(test, ['b1'], '复古系')
  test.reset(fixture())
  const renamed = groupPutBody([input('Sun', { id: 'i4', productId: 'a2', shopId: 'a' })])
  renamed.shopNames = JSON.stringify({ a: 'Renamed shop' })
  result = await test.run('orders', 'put', '/:id', { params: { id: 'o2' }, body: renamed })
  assert.equal(result.status, 200)
  assertStyles(test, ['a1', 'a2'], '食物系')
  test.reset(fixture())
  result = await test.run('orders', 'post', '/group', { body: { shops: JSON.stringify([{ shopName: 'New shop', items: [input('Sun', { productId: 'b1' })] }]) } })
  assert.equal(result.status, 400)
  console.log('PASS group POST/PUT all branches; request-local reuse/sync/inheritance/clear/last wins/shop rename/isolation; artist/totals intact')
}

async function existingRegressions() {
  await vm.runInNewContext(patchedArtistSource, context(path.join(root, 'scripts/test-artists.cjs')))
  assert.ok(!process.exitCode, 'Existing artist regressions must pass')
  const filename = path.join(root, 'scripts/test-query-performance.cjs')
  const source = fs.readFileSync(filename, 'utf8')
  await vm.runInNewContext(source, context(filename))
  assert.ok(!process.exitCode, 'Existing query-performance regressions must pass')
  console.log('PASS existing artist and query-performance regressions with shared type constants')
}

;(async () => {
  await patchAndValidation()
  await searchAndReads()
  await invalidOrders()
  await ordinaryOrders()
  await groupOrders()
  await existingRegressions()
  console.log('All style backend regressions passed (synthetic data only).')
})().catch(error => { console.error(error); process.exitCode = 1 })
