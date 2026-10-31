// In-flight GET sharing tests. Synthetic fetch only; no network or user data.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const output = ts.transpileModule(fs.readFileSync('src/api/client.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const exported = { exports: {} }
const requests = []
vm.runInNewContext(output, {
  module: exported, exports: exported.exports, URLSearchParams,
  fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
})
const { productApi, shopApi } = exported.exports
const fulfill = (index, data) => requests[index].resolve({ ok: true, json: async () => data })

;(async () => {
  const first = productApi.getSetProducts()
  const duplicate = productApi.getSetProducts()
  assert.equal(requests.length, 1)
  fulfill(0, [{ productId: 'synthetic' }])
  assert.deepEqual(await first, await duplicate)
  const fresh = productApi.getSetProducts()
  assert.equal(requests.length, 2)
  fulfill(1, [])
  await fresh
  console.log('PASS: identical concurrent reads shared; completed responses are not cached')

  const oldRead = productApi.getSetProducts()
  const mutation = shopApi.create('Synthetic shop')
  const newRead = productApi.getSetProducts()
  assert.equal(requests.length, 5)
  fulfill(2, [])
  await oldRead
  const newDuplicate = productApi.getSetProducts()
  assert.equal(requests.length, 5)
  fulfill(3, { id: 'synthetic-shop' })
  fulfill(4, [{ productId: 'fresh' }])
  await mutation
  assert.deepEqual(await newRead, await newDuplicate)
  console.log('PASS: mutations invalidate read sharing; old completion cannot clear a newer pending read')

  const failing = productApi.getLooseItems()
  requests[5].reject(new Error('synthetic failure'))
  await assert.rejects(failing, /synthetic failure/)
  const retry = productApi.getLooseItems()
  assert.equal(requests.length, 7)
  fulfill(6, [])
  await retry
  console.log('PASS: rejected reads cleaned up and can be retried')

  const exact = productApi.search('artist', 'Alice & A?', true)
  const partial = productApi.search('artist', 'Alice & A?')
  assert.equal(requests.length, 9)
  const exactUrl = new URL(requests[7].url, 'http://example.test')
  const partialUrl = new URL(requests[8].url, 'http://example.test')
  assert.equal(exactUrl.searchParams.get('keyword'), 'Alice & A?')
  assert.equal(exactUrl.searchParams.get('exact'), 'true')
  assert.equal(partialUrl.searchParams.get('exact'), null)
  fulfill(7, [])
  fulfill(8, [])
  await Promise.all([exact, partial])
  console.log('PASS: exact/partial searches have separate requests and names are safely encoded')

  const food = productApi.search('artist', 'Alice & A?', true, '食物系')
  const cute = productApi.search('artist', 'Alice & A?', true, '可爱系')
  assert.equal(requests.length, 11)
  const foodUrl = new URL(requests[9].url, 'http://example.test')
  const cuteUrl = new URL(requests[10].url, 'http://example.test')
  assert.equal(foodUrl.searchParams.get('style'), '食物系')
  assert.equal(foodUrl.searchParams.get('keyword'), 'Alice & A?')
  assert.equal(foodUrl.searchParams.get('exact'), 'true')
  assert.equal(cuteUrl.searchParams.get('style'), '可爱系')
  fulfill(9, [])
  fulfill(10, [])
  await Promise.all([food, cute])
  console.log('PASS: style composes with artist/exact search and different styles do not share responses')
})().catch(error => { console.error(error); process.exitCode = 1 })
