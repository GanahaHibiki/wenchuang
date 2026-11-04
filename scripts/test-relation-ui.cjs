// Relation UI regression: mocked APIs/images only; never real backend/data.
// NODE_PATH=/path/to/playwright/node_modules node scripts/test-relation-ui.cjs
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { chromium } = require('playwright')
const base = 'http://127.0.0.1:5192'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="lightgreen"/></svg>'
const image = { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLfoAAAAASUVORK5CYII=', 'base64') }
const spec = { type: '大食量set', sequenceNumber: 1, quantity: 1, purchasePrice: 10, originalPrice: 20 }
const products = [
  ['a', '点心A', '店铺甲', '画师甲', '食物系', 800, 600],
  ['b', '同款B', '店铺乙', '画师乙', '可爱系', 3000, 2000],
  ['c', '同款C', '店铺丙', '画师甲', '食物系', 1200, 900],
  ['d', '同款同店', '店铺甲', '画师甲', '食物系', 600, 400],
  ['orphan', '同款孤立', '店铺丁', '画师丁', '其他', 600, 400],
].map(([id, name, shopName, artist, style, width, height]) => ({
  id, name, shopName, shopId: `shop-${shopName}`, artist, style, imagePath: `${id}.png`, thumbnailPath: `${id}.jpg`,
  imageResolution: { width, height }, createdAt: '2026-01-01', recorded: id !== 'orphan',
}))
const posted = []
let groups = []
let createdOrder
const byId = id => products.find(product => product.id === id)
const family = id => [...(groups.find(group => group.has(id)) || new Set([id]))].map(byId).filter(product => product?.recorded)
const ordered = members => products.filter(product => members.some(member => member.id === product.id))
const bestImage = members => [...members].sort((a, b) => b.imageResolution.width * b.imageResolution.height - a.imageResolution.width * a.imageResolution.height)[0]
function setRelations(id, targets) {
  groups = groups.map(group => new Set([...group].filter(member => member !== id))).filter(group => group.size > 1)
  if (!targets.length) return
  const merged = new Set([id, ...targets.flatMap(target => family(target).map(product => product.id))])
  groups = groups.filter(group => ![...group].some(member => merged.has(member)))
  groups.push(merged)
}
function entries(product) {
  const record = sequence => ({ orderId: `order-${sequence}`, orderSequence: sequence, orderType: 'shop', shopName: product.shopName, specifications: [spec] })
  if (product.id === 'a') return { purchased: [record(101), record(102)], gifts: [{ ...record(103), giftType: '满赠礼' }], smallGifts: [] }
  if (product.id === 'b') return { purchased: [record(201)], gifts: [], smallGifts: [record(202)] }
  return { purchased: [record(product.id === 'c' ? 301 : 401)], gifts: [], smallGifts: [] }
}
function detail(id) {
  const product = byId(id)
  const members = ordered(family(id))
  const best = bestImage(members)
  return { ...product, entries: entries(product), ...(members.length > 1 ? {
    linkedProducts: members.map(product => ({ ...product, entries: entries(product) })),
    relationTargets: members.filter(member => member.id !== id && member.shopName !== product.shopName),
    displayImage: { productId: best.id, imagePath: best.imagePath, thumbnailPath: best.thumbnailPath },
  } : {}) }
}
function field(body, name) {
  return body.match(new RegExp(`name="${name}"[^\\r\\n]*\\r\\n(?:[^\\r\\n]+\\r\\n)*\\r\\n([\\s\\S]*?)\\r\\n--`))?.[1]
}
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('[data-scroll-loading]'))
  await page.waitForTimeout(150)
}
async function pick(page, name, shop) {
  await page.getByPlaceholder('输入其他店铺的商品名查找').fill('同款')
  await page.getByRole('button', { name: `关联 ${name}（${shop}）`, exact: true }).click()
}

;(async () => {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5192', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let browser
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Vite startup timeout')), 20000)
      server.stdout.on('data', data => { if (data.toString().includes('Local:')) { clearTimeout(timer); resolve() } })
      server.on('exit', code => { clearTimeout(timer); reject(new Error(`Vite exit ${code}`)) })
      server.stderr.on('data', data => process.stderr.write(data))
    })
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.route('**/images/**', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }))
    await page.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (!url.pathname.startsWith('/api/')) return route.continue()
      let data
      if (url.pathname === '/api/products/link-candidates') {
        const source = byId(url.searchParams.get('productId'))
        const shop = source?.shopName || url.searchParams.get('shopName')
        const keyword = (url.searchParams.get('keyword') || '').toLowerCase()
        data = products.filter(product => product.recorded && product.shopName !== shop && product.name.toLowerCase().includes(keyword))
      } else if (url.pathname === '/api/products/artists') {
        data = [...new Set(products.map(product => product.artist).filter(Boolean))]
      } else if (url.pathname.endsWith('/relations')) {
        const id = url.pathname.split('/')[3]
        if (request.method() === 'PUT') setRelations(id, request.postDataJSON().productIds)
        data = ordered(family(id)).filter(product => product.id !== id && product.shopName !== byId(id).shopName)
      } else if (url.pathname === '/api/products/search') {
        const type = url.searchParams.get('type')
        const keyword = (url.searchParams.get('keyword') || '').trim().toLowerCase()
        const style = url.searchParams.get('style')
        const matches = products.filter(product => {
          const name = (type === 'artist' ? product.artist || '' : type === 'shopName' ? product.shopName : product.name).toLowerCase()
          return product.recorded && (!keyword || (url.searchParams.get('exact') === 'true' ? name === keyword : name.includes(keyword))) && (!style || product.style === style)
        })
        if (url.searchParams.get('groupRelated') !== 'true') data = matches
        else {
          const seen = new Set()
          data = []
          for (const product of matches) {
            const members = ordered(family(product.id))
            const primary = members[0]
            if (seen.has(primary.id)) continue
            seen.add(primary.id)
            if (members.length === 1) data.push(product)
            else {
              const best = bestImage(members)
              data.push({ ...primary, name: members.map(member => member.name).join('/'), shopName: members.map(member => member.shopName).join('/'),
                imagePath: best.imagePath, thumbnailPath: best.thumbnailPath, linkedProducts: members })
            }
          }
        }
      } else if (url.pathname.startsWith('/api/products/')) data = detail(url.pathname.split('/').pop())
      else if (url.pathname.startsWith('/api/shops')) data = ['店铺甲', '店铺乙', '店铺丙'].map(name => ({ id: `shop-${name}`, name, createdAt: '2026-01-01' }))
      else if (url.pathname.startsWith('/api/wishes')) data = []
      else if (request.method() === 'POST' && (url.pathname === '/api/orders' || url.pathname === '/api/orders/group')) {
        const body = request.postData()
        const group = url.pathname.endsWith('/group')
        const inputs = group ? JSON.parse(field(body, 'shops')) : [{ shopName: field(body, 'shopName'), items: JSON.parse(field(body, 'purchasedItems')) }]
        posted.push(inputs)
        const items = inputs.flatMap((shop, shopIndex) => shop.items.map((input, index) => {
          const product = { id: `new-${posted.length}-${shopIndex}-${index}`, name: input.productName, shopName: shop.shopName, shopId: `shop-${shop.shopName}`,
            artist: input.artist, style: input.style, imagePath: 'new.png', thumbnailPath: 'new.jpg', imageResolution: { width: 400, height: 300 }, createdAt: '2026-02-01', recorded: true }
          products.push(product)
          if (input.relatedProductIds) setRelations(product.id, input.relatedProductIds)
          return { id: `item-${product.id}`, productId: product.id, product, category: 'purchased', shopId: product.shopId, specifications: input.specifications }
        }))
        createdOrder = { id: `new-order-${posted.length}`, orderType: group ? 'group' : 'shop', sequenceNumber: 2, groupSequenceNumber: 1,
          shop: group ? null : { name: inputs[0].shopName }, shops: inputs.map(shop => ({ id: `shop-${shop.shopName}`, name: shop.shopName })),
          purchasedItems: items, gifts: [], smallGifts: [], totalAmount: 20, giftTotal: 0, smallGiftTotal: 0, giftRatio: 0 }
        data = { id: createdOrder.id }
      } else if (url.pathname.startsWith('/api/orders/')) data = createdOrder
      else return route.fulfill({ status: 500, json: { message: `Unexpected mock ${request.method()} ${url.pathname}` } })
      await route.fulfill({ json: data })
    })

    await page.goto(`${base}/products/a`)
    await ready(page)
    await page.getByRole('button', { name: '编辑关联商品', exact: true }).click()
    await page.getByPlaceholder('输入其他店铺的商品名查找').fill('同款')
    await page.getByRole('list', { name: '关联候选商品' }).waitFor()
    assert.equal(await page.getByRole('button', { name: '关联 同款同店（店铺甲）', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: '关联 同款孤立（店铺丁）', exact: true }).count(), 0)
    assert.match(await page.getByRole('list', { name: '关联候选商品' }).innerText(), /店铺：店铺乙/)
    await page.getByRole('button', { name: '关联 同款B（店铺乙）', exact: true }).click()
    await page.getByRole('button', { name: '保存关联', exact: true }).click()
    await page.getByRole('button', { name: '编辑关联商品', exact: true }).waitFor()
    const aRecords = page.getByRole('region', { name: '点心A（店铺甲）订单记录', exact: true })
    const bRecords = page.getByRole('region', { name: '同款B（店铺乙）订单记录', exact: true })
    assert.equal(await aRecords.locator('a[href^="/orders/"]').count(), 3)
    assert.equal(await bRecords.locator('a[href^="/orders/"]').count(), 2)
    assert.equal(await page.locator('main a[href="/orders/order-101"]').count(), 1)
    assert.equal(await page.locator('main img[src="/images/original/b.png"]').count(), 1)
    console.log('PASS: existing product links other-shop candidates; every member shows all categorized orders')

    await page.goto(base)
    await ready(page)
    assert.equal(await page.locator('[data-product-card]').count(), 3)
    const card = page.locator('[data-product-card="a"]')
    assert.equal(await card.locator('img').getAttribute('src'), '/images/thumbnails/b.jpg')
    assert.deepEqual(await card.locator('a[href^="/products/"]').allTextContents(), ['点心A', '同款B'])
    assert.deepEqual(await card.locator('a[href*="type=shopName"]').allTextContents(), ['店铺甲', '店铺乙'])
    assert.match(await card.innerText(), /点心A \/ 同款B/)
    assert.match(await card.innerText(), /店铺甲 \/ 店铺乙/)
    await card.getByRole('link', { name: '店铺甲', exact: true }).click()
    await ready(page)
    await page.getByRole('group', { name: '风格分类筛选' }).getByRole('button', { name: '可爱系', exact: true }).click()
    await ready(page)
    assert.equal(await page.locator('[data-product-card]').count(), 0)
    console.log('PASS: one card, paired slash names/shops and largest image; filters cannot mix different members')

    await page.goto(`${base}/order-entry`)
    await page.getByPlaceholder('输入或选择店铺名').fill('新店铺')
    await page.getByRole('button', { name: '确认并进入下一步' }).click()
    await page.getByPlaceholder('请输入商品名称', { exact: true }).fill('新同款名字')
    await pick(page, '同款C', '店铺丙')
    await page.locator('input[type="file"]').setInputFiles(image)
    await page.getByLabel('大食量set', { exact: true }).check()
    await page.getByRole('button', { name: '进入下一步', exact: true }).click()
    await page.getByRole('button', { name: '进入下一步', exact: true }).click()
    await page.getByRole('button', { name: '录入完成', exact: true }).click()
    await page.waitForURL(`${base}/orders/new-order-1`)
    assert.deepEqual(posted[0][0].items[0].relatedProductIds, ['c'])
    console.log('PASS: new shop order submits selected related product IDs')

    await page.goto(`${base}/group-order-entry`)
    await page.getByPlaceholder('输入或选择店铺名').fill('拼单来源一')
    await page.getByPlaceholder('请输入商品名称', { exact: true }).fill('拼单新名字一')
    await pick(page, '同款C', '店铺丙')
    await page.locator('input[type="file"]').setInputFiles(image)
    await page.getByLabel('大食量set', { exact: true }).check()
    await page.getByRole('button', { name: '添加新店铺', exact: true }).click()
    await page.waitForTimeout(300)
    assert.equal(await page.getByRole('list', { name: '已选择的关联商品' }).count(), 0)
    await page.getByPlaceholder('输入或选择店铺名').fill('拼单来源二')
    await page.getByPlaceholder('请输入商品名称', { exact: true }).fill('拼单新名字二')
    await pick(page, '同款B', '店铺乙')
    await page.locator('input[type="file"]').setInputFiles(image)
    await page.getByLabel('大食量set', { exact: true }).check()
    await page.getByRole('button', { name: '提交拼单订单', exact: true }).click()
    await page.waitForURL(`${base}/orders/new-order-2`)
    assert.deepEqual(posted[1][0].items[0].relatedProductIds, ['c'])
    assert.deepEqual(posted[1][1].items[0].relatedProductIds, ['b'])
    console.log('PASS: multi-shop entry selections are independent and use the same candidate UI')

    await page.goto(`${base}/products/a`)
    await ready(page)
    await page.getByRole('button', { name: '编辑关联商品', exact: true }).click()
    const selected = page.getByRole('list', { name: '已选择的关联商品' })
    while (await selected.getByRole('button').count()) await selected.getByRole('button').first().click()
    await page.getByRole('button', { name: '保存关联', exact: true }).click()
    await page.getByRole('button', { name: '编辑关联商品', exact: true }).waitFor()
    assert.equal(await page.getByRole('heading', { name: '点心A', exact: true }).count(), 1)
    assert.match(await page.locator('main').innerText(), /同款关联：未关联/)
    await page.goto(base)
    await ready(page)
    assert.equal(await page.locator('[data-product-card]').count(), 4)
    console.log('PASS: unlink restores standalone card without deleting other members or orders')
    assert.deepEqual(errors, [])
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
