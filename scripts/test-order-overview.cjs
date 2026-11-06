/* Synthetic filesystem + real route/database code; never reads or writes user data. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync('scripts/test-artists.cjs', 'utf8')
const context = { require, console, Buffer, process, __dirname: path.resolve('scripts'), module: { exports: {} } }
vm.runInNewContext(source.slice(0, source.indexOf(';(async () => {')) + '\nmodule.exports = { sandbox, fixture };', context)
const { sandbox, fixture } = context.module.exports
function utility(file) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports })
  return module.exports
}
const json = value => JSON.parse(JSON.stringify(value))
const { normalizeNoteHighlights, removeNoteHighlight, adjustNoteHighlights } = utility('src/utils/noteHighlights.ts')
const { normalizeOrderTime, parseOrderTime } = utility('src/utils/orderTime.ts')

;(async () => {
  assert.equal(normalizeOrderTime('２０２６－０２－０３　１２：３４：５６'), '2026-02-03 12:34:56')
  assert.equal(parseOrderTime('２０２６－０２－０３　１２：３４：５６').getSeconds(), 56)
  for (const input of ['bad', '2026-02-30 12:00:00', '2026-13-01 00:00:00', '2026-01-01 25:00:00', '2026-01-01 12:00:60']) {
    assert.equal(parseOrderTime(input), null)
  }
  assert.ok(parseOrderTime('2024-02-29 00:00:00'))
  assert.deepEqual(json(normalizeNoteHighlights('abcdef', [{ start: 3, end: 6 }, { start: 1, end: 4 }])), [{ start: 1, end: 6 }])
  assert.deepEqual(json(removeNoteHighlight([{ start: 0, end: 6 }], 2, 4)), [{ start: 0, end: 2 }, { start: 4, end: 6 }])
  assert.deepEqual(json(adjustNoteHighlights('abcdef', 'Xabcdef', [{ start: 2, end: 4 }])), [{ start: 3, end: 5 }])
  assert.deepEqual(json(adjustNoteHighlights('abcdef', 'abXYef', [{ start: 1, end: 5 }])), [{ start: 1, end: 2 }, { start: 4, end: 5 }])
  assert.deepEqual(json(adjustNoteHighlights('abcdef', '', [{ start: 0, end: 6 }])), [])
  const initial = fixture()
  const test = sandbox(initial)
  for (const id of ['o1', 'o2']) {
    const note = '普通备注，重要内容，结尾😀'
    const ranges = [{ start: 5, end: 7 }, { start: 7, end: 9 }]
    let result = await test.run('orders', 'patch', '/:id/note', { params: { id }, body: { note, noteHighlights: ranges } })
    assert.equal(result.status, 200)
    assert.equal(result.writes, 1)
    assert.deepEqual(json(result.data.noteHighlights), [{ start: 5, end: 9 }])
    assert.deepEqual(json(result.data.items), json(initial.orders.find(o => o.id === id).items))
    const reloaded = sandbox(test.db())
    result = await reloaded.run('orders', 'get', '/')
    assert.deepEqual(json(result.data.find(o => o.id === id).noteHighlights), [{ start: 5, end: 9 }])
    result = await test.run('orders', 'patch', '/:id/note', { params: { id }, body: { note: '旧客户端文字' } })
    assert.equal(result.data.note, '旧客户端文字')
    assert.deepEqual(json(result.data.noteHighlights), [])
  }
  for (const body of [
    { note: 1 }, { note: 'abc', noteHighlights: 'red' },
    ...[null, { start: -1, end: 2 }, { start: 0, end: 4 }, { start: 2, end: 1 }, { start: 0.5, end: 2 }].map(range => ({ note: 'abc', noteHighlights: [range] })),
  ]) {
    const result = await test.run('orders', 'patch', '/:id/note', { params: { id: 'o1' }, body })
    assert.equal(result.status, 400)
    assert.equal(result.writes, 0)
  }
  assert.equal((await test.run('orders', 'patch', '/:id/note', { params: { id: 'missing' }, body: { note: '' } })).status, 404)
  console.log('PASS: full-width conversion, strict calendar dates, range editing, shop/group note persistence, legacy compatibility and invalid requests (fake filesystem only)')
})().catch(error => { console.error(error); process.exitCode = 1 })
