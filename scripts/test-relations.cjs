/* Run: node scripts/test-relations.cjs
 * Real route/database/helper code, VM fake JSON FS and injected image metadata.
 * Never starts HTTP, reads real data/ or writes images. Existing tests are only
 * read; their module mocks are extended in memory for the new helper imports.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const clone = value => JSON.parse(JSON.stringify(value))
const imageState = { files: new Map(), stats: 0, decodes: 0 }
const fakeStat = async filename => {
  imageState.stats++
  const value = imageState.files.get(path.basename(filename))
  if (value === null) throw new Error('Missing fake image')
  return { mtimeMs: value?.mtimeMs ?? 1, size: value?.size ?? 100 }
}
const fakeSharp = filename => ({ metadata: async () => {
  imageState.decodes++
  const value = imageState.files.get(path.basename(filename))
  if (value?.broken) throw new Error('Invalid fake image')
  return { width: value?.width ?? 100, height: value?.height ?? 100 }
} })
function context(filename, customRequire = require) {
  return { require: customRequire, console, Buffer, process, __dirname: path.dirname(filename), module: { exports: {} }, fakeStat, fakeSharp }
}
const artistSource = fs.readFileSync(path.join(root, 'scripts/test-artists.cjs'), 'utf8')
const patchedHarness = artistSource
  .replace('const fakeFs = {', 'const fakeFs = { stat: fakeStat,')
  .replace("if (name === 'sharp') return () => { throw new Error('Real image processing prohibited') }", "if (name === 'sharp') return fakeSharp")
  .replace("service: load(path.join(root, 'server/services/database.ts')),", "service: load(path.join(root, 'server/services/database.ts')),\n    relations: load(path.join(root, 'server/services/productRelations.ts')),\n    imageHelpers: load(path.join(root, 'server/services/imageResolution.ts')),")
const harness = context(path.join(root, 'scripts/test-artists.cjs'))
vm.runInNewContext(patchedHarness.slice(0, patchedHarness.indexOf(';(async () => {')) +
  '\nmodule.exports = { sandbox, fixture, upload, input, normalBody, groupBody, groupPutBody };', harness)
const { sandbox: rawSandbox, fixture: baseFixture, upload, input, normalBody, groupBody, groupPutBody } = harness.module.exports
function fixture() {
  const db = clone(baseFixture())
  db.products.find(p => p.id === 'a1').style = '食物系'
  db.products.find(p => p.id === 'a2').style = '食物系'
  db.products.find(p => p.id === 'b1').style = '盐系'
  db.shops.push({ id: 'c', name: '店铺C', createdAt: '2026-01-01' })
  for (const [id, name, category] of [['c1', 'Moon', 'gift'], ['c2', 'Moon', 'smallGift'], ['c3', 'Star', 'purchased']]) {
    db.products.push({ id, name, artist: 'Carol', style: '可爱系', imagePath: `${id}.png`, thumbnailPath: `${id}.jpg`, createdAt: id === 'c1' ? '2025-01-01' : '2026-01-01' })
    db.orders.push({ ...clone(db.orders[0]), id: `${id}-order`, shopId: 'c', sequenceNumber: db.orders.length + 1,
      items: [{ ...clone(db.orders[0].items[0]), id: `${id}-item`, productId: id, category, ...(category === 'gift' ? { giftType: '其他' } : {}) }] })
  }
  // A physical product used only by a wish is ineligible just like an orphan.
  db.products.push({ id: 'wish-product', name: 'Sun', imagePath: 'wish.png', thumbnailPath: 'wish.jpg', createdAt: '2026-01-01' })
  db.wishItems.push({ ...clone(db.wishItems[0]), id: 'wish-c', productId: 'wish-product', shopId: 'c' })
  db.nextOrderSequence = db.orders.length + 1
  return db
}
function sandbox(initial = fixture(), overrides) {
  const test = rawSandbox(initial, overrides)
  return { ...test, db: () => clone(test.db()), run: async (...args) => clone(await test.run(...args)) }
}
const relationIds = result => result.data.map(p => p.id)
const put = (test, id, productIds) => test.run('products', 'put', '/:id/relations', { params: { id }, body: { productIds } })
const get = (test, id) => test.run('products', 'get', '/:id/relations', { params: { id } })
const groups = test => test.db().productLinks.map(link => link.productIds)
function assertDisjoint(test) {
  const ids = groups(test).flat()
  assert.equal(new Set(ids).size, ids.length, 'Physical IDs are in disjoint equivalence groups')
}
async function candidatesAndValidation() {
  const test = sandbox()
  for (const query of [
    { shopName: '店铺A', keyword: ' sUN ' },
    { shopName: ' 店铺A ', keyword: 'SUN', productId: 'a2' },
  ]) {
    const result = await test.run('products', 'get', '/link-candidates', { query })
    assert.equal(result.status, 200)
    assert.deepEqual(relationIds(result), ['b1'])
    assert.equal(result.data[0].shopId, 'b')
    assert.equal(result.reads, 1)
    assert.equal(result.writes, 0)
  }
  const sameDisplayShop = await test.run('products', 'get', '/link-candidates', { query: { shopName: '店铺B', keyword: 'sun' } })
  assert.deepEqual(relationIds(sameDisplayShop), ['a1'], 'Legacy case-variant shop display names also dedup')
  const gifts = await test.run('products', 'get', '/link-candidates', { query: { shopName: '店铺A', keyword: ' moon ' } })
  assert.deepEqual(relationIds(gifts), ['c1'], 'Gift/smallGift namesakes dedup to oldest ID')
  for (const query of [ {}, { shopName: ' ' }, { shopName: '店铺A', productId: 'b1' },
    { shopName: '店铺A', productId: 'missing' }, { shopName: '店铺A', productId: 'orphan' } ]) {
    assert.equal((await test.run('products', 'get', '/link-candidates', { query })).status, 400)
  }
  const many = fixture()
  for (let i = 0; i < 60; i++) {
    const product = { ...clone(many.products[0]), id: `many-${i}`, name: `Other ${i}` }
    many.products.push(product)
    many.orders[1].items.push({ ...clone(many.orders[1].items[1]), id: `many-item-${i}`, productId: product.id })
  }
  assert.equal((await sandbox(many).run('products', 'get', '/link-candidates', { query: { shopName: '店铺A' } })).data.length, 50)
  const before = test.db()
  for (const ids of [undefined, null, false, 'b1', {}, [null], [42], [''], [' '], ['missing'], ['orphan'], ['wish-product'], ['a1'], ['a2'], ['case']]) {
    const result = await put(test, 'a1', ids)
    assert.equal(result.status, 400, JSON.stringify(ids))
    assert.equal(result.writes + result.images, 0)
  }
  assert.equal((await put(test, 'missing', ['b1'])).status, 404)
  assert.equal((await get(test, 'missing')).status, 404)
  assert.deepEqual(relationIds(await get(test, 'orphan')), [])
  assert.deepEqual(test.db(), before)
  console.log('PASS other-shop candidates/dedup/gifts/50 cap/source validation; invalid and missing IDs')
}
async function equivalenceGroups() {
  const test = sandbox()
  const originalOrders = test.db().orders
  let result = await put(test, 'a2', ['b1', 'b1'])
  assert.equal(result.status, 200)
  assert.deepEqual(relationIds(result), ['b1'])
  assert.equal(result.reads, 1)
  assert.equal(result.writes, 1)
  assert.deepEqual(groups(test), [['a1', 'a2', 'b1']])
  await put(test, 'c1', ['c3']) // Targets must be OTHER shops.
  assert.equal((await put(test, 'c1', ['c3'])).status, 400)
  await put(test, 'c1', ['b1'])
  assert.deepEqual(groups(test), [['a1', 'a2', 'b1', 'c1', 'c2']])
  assert.deepEqual(relationIds(await get(test, 'a1')), ['b1', 'c1'])
  assert.deepEqual(relationIds(await get(test, 'c2')), ['a1', 'b1'])
  await put(test, 'a1', [])
  assert.deepEqual(relationIds(await get(test, 'a2')), [])
  assert.deepEqual(groups(test), [['b1', 'c1', 'c2']], 'Former peers stay linked')
  await put(test, 'a1', ['c3'])
  await put(test, 'a2', ['b1'])
  assert.deepEqual(groups(test), [['a1', 'a2', 'b1', 'c1', 'c2']], 'Nonempty replaces old source group, merges target group')
  assert.deepEqual(relationIds(await get(test, 'c3')), [])
  assert.deepEqual(test.db().orders, originalOrders)
  assert.equal(test.db().products.find(p => p.id === 'b1').artist, 'Bob')
  assert.equal(test.db().products.find(p => p.id === 'b1').style, '盐系')
  assertDisjoint(test)
  // Old overlapping groups and incomplete history are normalized at mutation.
  const malformed = fixture()
  malformed.productLinks = [{ id: 'x', productIds: ['a1', 'b1', 'missing'] }, { id: 'y', productIds: ['b1', 'c2'] }]
  const normalized = sandbox(malformed)
  assert.deepEqual(relationIds(await get(normalized, 'a2')), ['b1', 'c1'])
  await put(normalized, 'a2', ['b1'])
  assert.deepEqual(groups(normalized), [['a1', 'a2', 'b1', 'c1', 'c2']])
  assertDisjoint(normalized)
  console.log('PASS group creation/merge/replacement/detach; history expansion; disjoint normalization; unchanged metadata/orders')
}
async function invalidOrders() {
  const test = sandbox()
  for (const ids of [null, 'b1', [17], ['missing'], ['orphan'], ['wish-product'], ['a2']]) {
    for (const category of ['purchased', 'gift', 'smallGift']) {
      const arrays = ['purchased', 'gift', 'smallGift'].map(value => value === category ? [input('Sun', { id: 'i1', productId: 'a1', relatedProductIds: ids, existingImagePath: 'fake.png' })] : [])
      for (const method of ['post', 'put']) {
        const result = await test.run('orders', method, method === 'post' ? '/' : '/:id', {
          params: { id: 'o1' }, body: normalBody(...arrays, method === 'post' ? '店铺A' : 'Do Not Rename'),
          files: [upload({ purchased: 'purchasedImage_0', gift: 'giftImage_0', smallGift: 'smallGiftImage_0' }[category])],
        })
        assert.equal(result.status, 400)
        assert.equal(result.writes + result.images, 0, 'Validation before shop/image mutations')
      }
    }
    const data = input('Sun', { id: 'i4', productId: 'a2', shopId: 'a', relatedProductIds: ids })
    for (const method of ['post', 'put']) {
      const body = method === 'post' ? groupBody([data]) : groupPutBody([data])
      if (method === 'put') body.shopNames = JSON.stringify({ a: 'Do Not Rename' })
      const result = await test.run('orders', method, method === 'post' ? '/group' : '/:id', {
        params: { id: 'o2' }, body, files: [upload(method === 'post' ? 'shop0_item0' : 'item_i4')],
      })
      assert.equal(result.status, 400)
      assert.equal(result.writes + result.images, 0)
    }
  }
  assert.deepEqual(test.db(), fixture())
  console.log('PASS invalid links rejected before ALL ordinary/group POST/PUT shop/image writes')
}
async function ordinaryOrders() {
  for (const category of ['purchased', 'gift', 'smallGift']) {
    for (const method of ['post', 'put']) {
      for (const mode of ['omitted', 'empty', 'replace']) {
        const test = sandbox()
        await put(test, 'a1', ['b1'])
        const data = input('Sun', { ...(method === 'put' ? { id: 'i1', productId: 'a1' } : { existingImagePath: 'fake.png' }),
          giftType: '其他', artist: ' Updated Alice ', style: '食物系',
          ...(mode === 'omitted' ? {} : { relatedProductIds: mode === 'empty' ? [] : ['c1'] }),
        })
        const arrays = ['purchased', 'gift', 'smallGift'].map(value => value === category ? [data] : [])
        const result = await test.run('orders', method, method === 'post' ? '/' : '/:id', { params: { id: 'o1' }, body: normalBody(...arrays) })
        assert.equal(result.status, method === 'post' ? 201 : 200)
        const id = result.data.items[0].productId
        assert.deepEqual(relationIds(await get(test, id)), mode === 'empty' ? [] : mode === 'replace' ? ['c1'] : ['b1'])
        assert.deepEqual(relationIds(await get(test, 'a2')), mode === 'empty' ? [] : mode === 'replace' ? ['c1'] : ['b1'])
        const db = test.db()
        assert.equal(db.products.find(p => p.id === 'b1').artist, 'Bob')
        assert.equal(db.products.find(p => p.id === 'b1').style, '盐系')
        assert.equal(db.products.find(p => p.id === id).artist, 'Updated Alice')
        assert.equal(result.data.totalAmount, category === 'purchased' ? 6 : 0)
        assert.equal(result.data.giftTotal, category === 'gift' ? 10 : 0)
        assert.equal(result.data.smallGiftTotal, category === 'smallGift' ? 10 : 0)
        assert.equal(result.data.giftRatio, 0)
        assert.deepEqual(result.data.items[0].specifications, clone(data.specifications))
        assertDisjoint(test)
      }
    }
  }
  // Replacement physical ID with a renamed product inherits the selected
  // predecessor's links without syncing metadata to linked other shops.
  const test = sandbox()
  await put(test, 'a1', ['b1'])
  const result = await test.run('orders', 'put', '/:id', { params: { id: 'o1' }, body: normalBody([
    input('New alias', { id: 'i1', productId: 'a1' }),
  ]), files: [upload('purchasedImage_0')] })
  assert.notEqual(result.data.items[0].productId, 'a1')
  assert.deepEqual(relationIds(await get(test, result.data.items[0].productId)), ['b1'])
  assert.deepEqual(relationIds(await get(test, 'a2')), ['b1'])
  // Omission in a duplicate category must not undo explicit detach; last explicit wins.
  await test.run('orders', 'post', '/', { body: normalBody(
    [input('Sun', { existingImagePath: 'fake.png', relatedProductIds: [] })],
    [input('sUN', { existingImagePath: 'fake.png' })],
  ) })
  assert.deepEqual(relationIds(await get(test, 'a2')), [])
  console.log('PASS ordinary three categories POST/PUT omitted/empty/replace; same-name inheritance; rename replacement; metadata/totals/specs')
}
async function groupOrdersAndDeletion() {
  for (const method of ['post', 'put']) {
    for (const mode of ['omitted', 'empty', 'replace', 'new']) {
      const test = sandbox()
      await put(test, 'a1', ['b1'])
      const data = input('Sun', { id: mode === 'new' ? 'temp_new' : 'i4', shopId: 'a',
        ...(mode === 'new' ? {} : { productId: 'a2' }),
        ...(mode === 'empty' ? { relatedProductIds: [] } : mode === 'replace' ? { relatedProductIds: ['c1'] } : {}),
      })
      const items = method === 'post' ? [data] : [data, input('Sun', { id: 'i5', productId: 'b1', shopId: 'b' })]
      const result = await test.run('orders', method, method === 'post' ? '/group' : '/:id', {
        params: { id: 'o2' }, body: method === 'post' ? groupBody(items) : groupPutBody(items),
        files: mode === 'new' ? [upload(method === 'post' ? 'shop0_item0' : 'item_temp_new')] : [],
      })
      assert.equal(result.status, method === 'post' ? 201 : 200)
      assert.deepEqual(relationIds(await get(test, result.data.items[0].productId)), mode === 'empty' ? [] : mode === 'replace' ? ['c1'] : ['b1'])
      assert.equal(result.data.totalAmount, method === 'post' ? 6 : 12)
      assert.equal(result.data.giftTotal + result.data.smallGiftTotal + result.data.giftRatio, 0)
      assert.equal(result.data.items[0].shopId, 'a')
      assertDisjoint(test)
    }
  }
  const test = sandbox()
  await put(test, 'a1', ['b1'])
  await test.run('orders', 'put', '/:id', {
    params: { id: 'o2' }, body: groupPutBody([input('Sun', { id: 'i4', productId: 'a2', shopId: 'a' })]),
  })
  assert.deepEqual(relationIds(await get(test, 'a1')), [], 'An edited-away sole order reference is ineligible')
  assert.equal((await put(test, 'a1', ['b1'])).status, 400, 'Orphan after editing is no longer selectable')
  // Persist a legacy group containing only one of the same-name history IDs.
  const db = fixture()
  db.productLinks = [{ id: 'legacy', productIds: ['a1', 'b1', 'c1'] }]
  test.reset(db)
  const deleted = await test.run('orders', 'delete', '/:id', { params: { id: 'o1' } })
  assert.equal(deleted.status, 200)
  assert.equal(test.db().products.some(p => p.id === 'a1'), false)
  assert.deepEqual(groups(test), [['a2', 'b1', 'c1', 'c2']])
  assert.deepEqual(relationIds(await get(test, 'a2')), ['b1', 'c1'])
  await test.run('orders', 'delete', '/:id', { params: { id: 'o2' } })
  assert.deepEqual(groups(test), [], 'Remove a group with only one logical member left')
  assert.equal(test.db().products.some(p => p.id === 'c2'), true)
  console.log('PASS group POST/PUT existing/new/omit/empty/replace; sole-reference cleanup; deletion transfers historical links')
}
async function groupedSearchAndDetail() {
  const test = sandbox()
  await put(test, 'a1', ['b1', 'c1'])
  for (const query of [
    { type: 'artist', keyword: 'Alice', style: '盐系' },
    { type: 'productName', keyword: 'Moon', style: '食物系' },
    { type: 'shopName', keyword: '店铺B', style: '可爱系' },
  ]) {
    const result = await test.run('products', 'get', '/search', { query: { ...query, groupRelated: 'true' } })
    assert.deepEqual(result.data, [], 'No cross-member AND-filter leak')
    assert.equal(result.reads, 1)
  }
  const queries = [
    { type: 'artist', keyword: ' Alice ', exact: 'true', style: '食物系' },
    { type: 'shopName', keyword: '店铺B', exact: 'true', style: '盐系' },
    { type: 'productName', keyword: 'Moon', style: '可爱系' },
  ]
  imageState.files.clear()
  imageState.files.set('a1.png', { width: 2000, height: 1000 })
  imageState.files.set('a2.png', { width: 3000, height: 2000 })
  imageState.files.set('b1.png', { width: 500, height: 500 })
  imageState.files.set('c1.png', { width: 300, height: 300 })
  imageState.files.set('c2.png', null)
  for (const query of queries) {
    const result = await test.run('products', 'get', '/search', { query: { ...query, groupRelated: 'true' } })
    assert.equal(result.data.length, 1)
    const card = result.data[0]
    assert.equal(card.id, 'a1')
    assert.equal(card.name, 'Sun/Sun/Moon')
    assert.equal(card.shopName, '店铺A/店铺B/店铺C')
    assert.deepEqual(card.linkedProducts.map(p => [p.name, p.shopName]), [['Sun', '店铺A'], ['Sun', '店铺B'], ['Moon', '店铺C']])
    assert.equal(card.imagePath, 'a2.png', 'Highest area across all history, even outside current filter')
    assert.equal(result.reads, 1)
    assert.equal(result.writes, 0)
  }
  const ordinary = await test.run('products', 'get', '/search', { query: { keyword: 'Sun' } })
  assert.ok(ordinary.data.length > 1)
  assert.equal(ordinary.data.some(p => Object.hasOwn(p, 'linkedProducts')), false)
  imageState.stats = imageState.decodes = 0
  const detail = await test.run('products', 'get', '/:id', { params: { id: 'a2' } })
  assert.equal(detail.reads, 1)
  assert.equal(detail.writes, 0)
  assert.equal(detail.data.entries.purchased.length, 2, 'Legacy entries remain source shop/name history')
  assert.deepEqual(detail.data.linkedProducts.map(p => p.id), ['a1', 'b1', 'c1'])
  assert.equal(detail.data.linkedProducts[0].entries.purchased.length, 2)
  assert.equal(detail.data.linkedProducts[1].entries.purchased.length, 1)
  assert.equal(detail.data.linkedProducts[2].entries.gifts.length, 1)
  assert.equal(detail.data.linkedProducts[2].entries.smallGifts.length, 1)
  assert.equal(detail.data.linkedProducts[0].entries.purchased[1].groupSequenceNumber, 1)
  assert.deepEqual(detail.data.displayImage, { productId: 'a2', imagePath: 'a2.png', thumbnailPath: 'a2_thumb.jpg' })
  assert.deepEqual(detail.data.relationTargets.map(p => p.id), ['b1', 'c1'])
  assert.equal(imageState.stats, 5)
  assert.equal(imageState.decodes, 0, 'Stat-based cross-request decode cache')
  imageState.files.set('a2.png', { mtimeMs: 2, size: 50, width: 50, height: 50 })
  const changed = await test.run('products', 'get', '/:id', { params: { id: 'a1' } })
  assert.equal(changed.data.displayImage.productId, 'a1')
  assert.equal(imageState.decodes, 1)
  for (const filename of ['a1.png', 'a2.png', 'b1.png', 'c1.png']) imageState.files.set(filename, { broken: true, mtimeMs: 9 })
  const invalid = await test.run('products', 'get', '/:id', { params: { id: 'a1' } })
  assert.equal(invalid.status, 200)
  assert.equal(Object.hasOwn(invalid.data, 'displayImage'), false)
  assert.equal(invalid.data.linkedProducts.length, 3)
  imageState.files.clear()
  console.log('PASS grouped AND/exact filters; one deterministic card/name-shop pairing/full members; largest historical image; complete per-member orders; cache/failure isolation')
}
async function imageInjection() {
  const test = sandbox()
  let stats = 0
  let decodes = 0
  let mtime = 1
  const factory = test.imageHelpers.createImageSelector({
    stat: async () => { stats++; return { mtimeMs: mtime, size: 3 } },
    metadata: async filename => { decodes++; return path.basename(filename) === 'other.png' ? { width: 60, height: 60 } : { width: 30, height: 40 } },
  })
  const product = fixture().products[0]
  const first = factory('FAKE_ORIGINALS')
  await Promise.all([first([product]), first([{ ...product, id: 'duplicate' }])])
  assert.equal(stats, 1, 'Same image across groups is statted once per snapshot')
  assert.equal(decodes, 1)
  await factory('FAKE_ORIGINALS')([product])
  assert.equal(decodes, 1)
  mtime++
  await factory('FAKE_ORIGINALS')([product])
  assert.equal(decodes, 2)
  const stored = await factory('FAKE_ORIGINALS')([
    { ...product, imagePath: 'known.png', imageResolution: { width: 10000, height: 20000 } },
    { ...product, id: 'actual-larger', imagePath: 'other.png' },
  ])
  assert.equal(stored.productId, 'actual-larger', 'Stale stored dimensions cannot override actual file metadata')
  assert.equal(decodes, 4)
  let active = 0
  let peak = 0
  const bounded = test.imageHelpers.createImageSelector({
    stat: async () => ({ mtimeMs: 1, size: 2 }),
    metadata: async () => {
      active++; peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 1))
      active--
      return { width: 20, height: 30 }
    },
  })
  await bounded('FAKE_ORIGINALS')(Array.from({ length: 20 }, (_, i) => ({ ...product, id: `parallel-${i}`, imagePath: `${i}.png` })))
  assert(peak > 1 && peak <= 8, `Bounded metadata parallelism, got ${peak}`)
  console.log('PASS injected image metadata; shared-path dedup; file-version invalidation; stale dimensions ignored; bounded parallelism')
}
async function legacyResponses() {
  const duplicate = fixture()
  duplicate.shops.push({ id: 'duplicate-a', name: '店铺A', createdAt: '2024-01-01' })
  duplicate.products.push({ ...clone(duplicate.products[0]), id: 'oldest-duplicate', createdAt: '2024-01-01' })
  duplicate.orders.push({ ...clone(duplicate.orders[0]), id: 'duplicate-order', shopId: 'duplicate-a', sequenceNumber: duplicate.orders.length + 1,
    items: [{ ...clone(duplicate.orders[0].items[0]), productId: 'oldest-duplicate' }] })
  const duplicateTest = sandbox(duplicate)
  await put(duplicateTest, 'a1', ['b1'])
  assert.deepEqual(relationIds(await get(duplicateTest, 'oldest-duplicate')), ['b1'])
  const cards = await duplicateTest.run('products', 'get', '/search', { query: { keyword: 'Sun', groupRelated: 'true' } })
  assert.equal(cards.data.length, 1, 'Same display shop/name history must not duplicate a grouped card')
  const baselineSources = Object.fromEntries(['server/routes/products.ts', 'server/routes/orders.ts', 'server/services/database.ts', 'server/services/productAssociations.ts'].map(file =>
    [path.join(root, file), execFileSync('git', ['show', `d4ca471:${file}`], { cwd: root, encoding: 'utf8' })]))
  const before = sandbox(fixture(), baselineSources)
  const after = sandbox(fixture())
  imageState.stats = imageState.decodes = 0
  for (const [route, params = {}, query = {}] of [
    ['/'], ['/:id', { id: 'a1' }], ['/:id', { id: 'a2' }], ['/:id', { id: 'orphan' }], ['/:id', { id: 'missing' }],
    ['/set-products'], ['/loose-items'],
    ...['productName', 'shopName', 'artist'].flatMap(type => ['', 'Sun', '店铺A', 'Alice'].flatMap(keyword =>
      [undefined, 'true'].map(exact => ['/search', {}, { type, keyword, exact }]))),
  ]) {
    const expected = await before.run('products', 'get', route, { params, query })
    const actual = await after.run('products', 'get', route, { params, query })
    assert.equal(actual.status, expected.status)
    assert.deepEqual(actual.data, expected.data, `${route} legacy JSON`)
    assert.equal(actual.reads, 1)
    assert.equal(actual.writes, 0)
  }
  const single = await after.run('products', 'get', '/search', { query: { groupRelated: 'true' } })
  const defaultSearch = await after.run('products', 'get', '/search')
  assert.deepEqual(single.data, defaultSearch.data, 'Unlinked grouped search JSON is unchanged')
  assert.equal(imageState.stats + imageState.decodes, 0, 'Unlinked reads never inspect images')
  console.log('PASS d4ca471 deep-equal legacy GET/default dropdown/search responses; single DB read; no unlinked image inspection')
}

async function existingRegressions() {
  const filename = path.join(root, 'scripts/test-styles.cjs')
  await vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context(filename))
  assert.ok(!process.exitCode, 'Existing style/artist/performance regressions must pass')
  console.log('PASS existing style/artist/performance suites with relation dependency mocks')
}
;(async () => {
  await candidatesAndValidation()
  await equivalenceGroups()
  await invalidOrders()
  await ordinaryOrders()
  await groupOrdersAndDeletion()
  await groupedSearchAndDetail()
  await imageInjection()
  await legacyResponses()
  await existingRegressions()
  console.log('All relation backend regressions passed (synthetic data/fake image metadata only).')
})().catch(error => { console.error(error); process.exitCode = 1 })
