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
})().catch(error => { console.error(error); process.exitCode = 1 })
