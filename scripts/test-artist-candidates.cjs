// Real /products/artists route in the existing VM/fake filesystem harness.
// No real backend, database or image operations. node scripts/test-artist-candidates.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source = fs.readFileSync('scripts/test-artists.cjs', 'utf8')
const context = { require, console, Buffer, process, __dirname: path.resolve('scripts'), module: { exports: {} } }
vm.runInNewContext(source.slice(0, source.indexOf(';(async () => {')) + '\nmodule.exports = { sandbox, fixture };', context)
const { sandbox, fixture } = context.module.exports

;(async () => {
  const db = fixture()
  for (const [id, artist] of [['duplicate', ' ALICE '], ['blank', '  '], ['invalid', 12], ['null', null]]) {
    db.products.push({ ...db.products[0], id, artist })
  }
  const test = sandbox(db)
  const before = JSON.parse(JSON.stringify(test.db()))
  const result = await test.run('products', 'get', '/artists')
  assert.equal(result.status, 200)
  assert.equal(result.reads, 1)
  assert.equal(result.writes + result.images, 0)
  assert.deepEqual(Array.from(result.data), ['Alice', 'Bob', 'Case Artist', 'Gift Artist', 'Orphan Artist', 'Small Artist'])
  assert(!result.data.includes('Wish Only'))
  assert.deepEqual(JSON.parse(JSON.stringify(test.db())), before)
  console.log('PASS: artist names trimmed/deduplicated, invalid values skipped, single read and no writes')

  test.reset(fixture())
  await test.run('products', 'patch', '/:id/artist', { params: { id: 'a1' }, body: { artist: '新美工' } })
  const fresh = await test.run('products', 'get', '/artists')
  assert(fresh.data.includes('新美工'))
  assert(!fresh.data.includes('Alice'))
  test.reset({ ...fixture(), products: [] })
  assert.deepEqual(Array.from((await test.run('products', 'get', '/artists')).data), [])
  console.log('PASS: new/edited artists visible immediately; empty catalog returns empty candidates')
})().catch(error => { console.error(error); process.exitCode = 1 })
