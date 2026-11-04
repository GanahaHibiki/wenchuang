// Default style regression: real server code with the VM/fake JSON filesystem.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source = fs.readFileSync('scripts/test-artists.cjs', 'utf8')
const context = { require, console, Buffer, process, __dirname: path.resolve('scripts'), module: { exports: {} } }
vm.runInNewContext(source.slice(0, source.indexOf(';(async () => {')) + '\nmodule.exports = { sandbox, fixture, input, normalBody, groupBody, upload };', context)
const { sandbox, fixture, input, normalBody, groupBody, upload } = context.module.exports

;(async () => {
  const db = fixture()
  db.products.find(product => product.id === 'a1').style = '可爱系'
  db.products.find(product => product.id === 'b1').style = '盐系'
  db.products.find(product => product.id === 'gift').style = '花卉系'
  db.products.find(product => product.id === 'small').style = '其他'
  db.products.find(product => product.id === 'case').style = '复古系'
  db.products.find(product => product.id === 'a2').style = ''
  const test = sandbox(db)
  const before = JSON.parse(JSON.stringify(test.db()))
  const food = await test.run('products', 'get', '/search', { query: { style: '食物系' } })
  assert.deepEqual(Array.from(food.data, product => product.id), ['a2'])
  assert.equal(food.reads, 1)
  assert.equal(food.writes, 0)
  assert.deepEqual(JSON.parse(JSON.stringify(test.db())), before)
  for (const [style, id] of [['可爱系', 'a1'], ['盐系', 'b1'], ['花卉系', 'gift'], ['其他', 'small'], ['复古系', 'case']]) {
    assert.equal(test.db().products.find(product => product.id === id).style, style)
  }
  console.log('PASS: legacy blank/missing style is searchable as food without rewriting or replacing chosen styles')

  for (const category of ['purchased', 'gift', 'smallGift']) {
    const blank = sandbox()
    const arrays = ['purchased', 'gift', 'smallGift'].map(value => value === category
      ? [input(`New ${category}`, { existingImagePath: 'fake.png', giftType: '满赠礼' })] : [])
    const result = await blank.run('orders', 'post', '/', { body: normalBody(...arrays) })
    assert.equal(result.status, 201)
    assert.equal(blank.db().products.find(product => product.id === result.data.items[0].productId).style, '食物系')
  }
  const group = sandbox()
  const created = await group.run('orders', 'post', '/group', {
    body: groupBody([input('New group')]), files: [upload('shop0_item0')],
  })
  assert.equal(created.status, 201)
  assert.equal(group.db().products.find(product => product.id === created.data.items[0].productId).style, '食物系')
  console.log('PASS: omitted style in brand-new shop/gift/smallGift/group products persists food')

  const reset = await test.run('products', 'patch', '/:id/style', { params: { id: 'a1' }, body: { style: '' } })
  assert.equal(reset.status, 200)
  assert.equal(reset.data.style, '食物系')
  assert.equal(test.db().products.find(product => product.id === 'b1').style, '盐系')
  console.log('PASS: legacy clear request resets food and does not touch other-shop categories')
})().catch(error => { console.error(error); process.exitCode = 1 })
