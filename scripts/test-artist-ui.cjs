// Browser regression for artist UI using intercepted APIs only, never real data.
// NODE_PATH=/path/to/playwright/node_modules node scripts/test-artist-ui.cjs
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { chromium } = require('playwright')
const base = 'http://127.0.0.1:5190'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="pink"/></svg>'
const image = { name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLfoAAAAASUVORK5CYII=', 'base64') }
const spec = { type: '大食量set', sequenceNumber: 1, quantity: 1, purchasePrice: 10, originalPrice: 20 }
const products = [
  { id: 'old', name: '旧商品', shopName: '旧店铺', imagePath: 'old.png', thumbnailPath: 'old.jpg', createdAt: '2026-01-01' },
  { id: 'existing', name: '已有作者商品', artist: '画师乙', shopName: '旧店铺', imagePath: 'existing.png', thumbnailPath: 'existing.jpg', createdAt: '2026-01-01' },
]
const shops = [{ id: 'shop-old', name: '旧店铺', createdAt: '2026-01-01' }]
let createdOrder
const submitted = []
const productById = id => products.find(product => product.id === id)
const item = (product, index, category = 'purchased') => ({ id: `item-${index}`, productId: product.id, category, product, specifications: [spec] })
function orderDetail(id) {
  if (createdOrder?.id === id) return createdOrder
  return { id, sequenceNumber: 1, orderType: 'shop', shopId: 'shop-old', shop: shops[0],
    totalAmount: 20, giftTotal: 20, smallGiftTotal: 0, giftRatio: 0, createdAt: '2026-01-01',
    purchasedItems: products.map((product, index) => item(product, index)),
    gifts: [{ ...item(products[0], 'gift', 'gift'), giftType: '满赠礼' }], smallGifts: [],
  }
}
function field(body, name) {
  return body.match(new RegExp(`name="${name}"[^\\r\\n]*\\r\\n(?:[^\\r\\n]+\\r\\n)*\\r\\n([\\s\\S]*?)\\r\\n--`))?.[1]
}
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('[data-scroll-loading]'))
  await page.waitForTimeout(150)
}

;(async () => {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5190', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] })
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
      if (url.pathname.endsWith('/artist') && request.method() === 'PATCH') {
        const product = productById(url.pathname.split('/')[3])
        product.artist = request.postDataJSON().artist.trim()
        data = product
      } else if (url.pathname === '/api/products/search') {
        const type = url.searchParams.get('type')
        const keyword = (url.searchParams.get('keyword') || '').toLowerCase()
        data = products.filter(product => (type === 'artist' ? product.artist || '' : type === 'shopName' ? product.shopName : product.name).toLowerCase().includes(keyword))
      } else if (url.pathname.startsWith('/api/products/')) {
        data = { ...productById(url.pathname.split('/').pop()), entries: { purchased: [], gifts: [], smallGifts: [] } }
      } else if (url.pathname.startsWith('/api/shops')) {
        data = shops
      } else if (url.pathname.startsWith('/api/wishes')) {
        data = []
      } else if (request.method() === 'POST' && (url.pathname === '/api/orders' || url.pathname === '/api/orders/group')) {
        const body = request.postData()
        const group = url.pathname.endsWith('/group')
        const groups = group ? JSON.parse(field(body, 'shops')) : [{ shopName: field(body, 'shopName'), items: JSON.parse(field(body, 'purchasedItems')) }]
        submitted.push({ groups, gifts: field(body, 'gifts') && JSON.parse(field(body, 'gifts')) })
        const purchasedItems = groups.flatMap((group, groupIndex) => group.items.map((entry, index) => ({
          id: `new-item-${groupIndex}-${index}`, productId: 'new', category: 'purchased', shopId: `new-shop-${groupIndex}`,
          specifications: entry.specifications, product: { id: 'new', name: entry.productName, artist: entry.artist, imagePath: 'new.png', thumbnailPath: 'new.jpg' },
        })))
        createdOrder = { id: `new-order-${submitted.length}`, orderType: group ? 'group' : 'shop', sequenceNumber: 2,
          groupSequenceNumber: 1, shop: group ? null : { name: groups[0].shopName },
          shops: groups.map((group, index) => ({ id: `new-shop-${index}`, name: group.shopName })),
          purchasedItems, gifts: [], smallGifts: [], totalAmount: 20, giftTotal: 0, smallGiftTotal: 0, giftRatio: 0,
        }
        data = { id: createdOrder.id }
      } else if (request.method() === 'PUT' && url.pathname.startsWith('/api/orders/')) {
        const body = request.postData()
        const payload = Object.fromEntries(['purchasedItems', 'gifts', 'smallGifts'].map(name => [name, JSON.parse(field(body, name))]))
        submitted.push(payload)
        for (const entry of [...payload.purchasedItems, ...payload.gifts, ...payload.smallGifts]) {
          if (entry.artist !== undefined) productById(entry.productId).artist = entry.artist
        }
        data = { id: url.pathname.split('/').pop() }
      } else if (url.pathname.startsWith('/api/orders/')) {
        data = orderDetail(url.pathname.split('/').pop())
      } else {
        return route.fulfill({ status: 500, json: { message: `Unexpected mock API ${request.method()} ${url.pathname}` } })
      }
      await route.fulfill({ json: data })
    })

    await page.goto(`${base}/products/old`)
    await ready(page)
    assert.match(await page.locator('main').innerText(), /美工作者：未填写/)
    await page.getByRole('button', { name: '编辑美工作者' }).click()
    await page.getByPlaceholder('请输入美工作者名称').fill('画师甲')
    await page.getByRole('button', { name: '保存美工作者', exact: true }).click()
    await page.getByRole('link', { name: '画师甲', exact: true }).waitFor()
    await page.reload()
    await ready(page)
    await page.getByRole('link', { name: '画师甲', exact: true }).click()
    await ready(page)
    assert.equal(await page.locator('main select').inputValue(), 'artist')
    assert.equal(await page.locator('main a[href^="/products/"]').count(), 1)
    assert.match(await page.locator('main').innerText(), /旧商品/)
    console.log('PASS: old product artist can be saved; artist link filters the gallery')

    await page.goto(`${base}/products/old`)
    await ready(page)
    await page.getByRole('button', { name: '编辑美工作者' }).click()
    await page.getByPlaceholder('请输入美工作者名称').fill('')
    await page.getByRole('button', { name: '保存美工作者', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('美工作者：未填写'))
    console.log('PASS: old artist can be cleared without changing product data')

    await page.goto(`${base}/order-entry`)
    await page.getByPlaceholder('输入或选择店铺名').fill('新店铺')
    await page.getByRole('button', { name: '确认并进入下一步' }).click()
    await page.getByPlaceholder('请输入商品名称', { exact: true }).fill('新商品')
    await page.getByPlaceholder('请输入美工作者名称').fill('画师丙')
    await page.locator('input[type="file"]').setInputFiles(image)
    await page.getByLabel('大食量set', { exact: true }).check()
    await page.getByRole('button', { name: '进入下一步', exact: true }).click()
    await page.getByRole('button', { name: '进入下一步', exact: true }).click()
    await page.getByRole('button', { name: '录入完成', exact: true }).click()
    await page.waitForURL(`${base}/orders/new-order-1`)
    await ready(page)
    assert.equal(submitted[0].groups[0].items[0].artist, '画师丙')
    assert.match(await page.locator('main').innerText(), /美工作者：画师丙/)
    console.log('PASS: new shop order submits and displays artist')

    await page.goto(`${base}/group-order-entry`)
    await page.getByPlaceholder('输入或选择店铺名').fill('旧店铺')
    await page.locator('main select').first().waitFor()
    await page.locator('main select').first().selectOption('existing')
    assert.equal(await page.getByPlaceholder('请输入美工作者名称').inputValue(), '画师乙')
    await page.getByLabel('大食量set', { exact: true }).check()
    await page.getByRole('button', { name: '添加新店铺', exact: true }).click()
    await page.waitForTimeout(300)
    assert.equal(await page.getByLabel('大食量set', { exact: true }).isChecked(), false)
    await page.getByPlaceholder('输入或选择店铺名').fill('拼单新店铺')
    await page.getByPlaceholder('请输入商品名称', { exact: true }).fill('拼单新商品')
    await page.getByPlaceholder('请输入美工作者名称').fill('画师丁')
    await page.locator('input[type="file"]').setInputFiles(image)
    await page.getByLabel('大食量set', { exact: true }).check()
    await page.getByRole('button', { name: '提交拼单订单', exact: true }).click()
    await page.waitForURL(`${base}/orders/new-order-2`)
    await ready(page)
    assert.equal(submitted[1].groups[0].items[0].artist, '画师乙')
    assert.equal(submitted[1].groups[1].items[0].artist, '画师丁')
    console.log('PASS: multi-shop group order copies existing artist and submits a new artist')

    await page.goto(`${base}/orders/old-order`)
    await ready(page)
    await page.locator('section').filter({ has: page.getByRole('heading', { name: '已购商品', exact: true }) }).getByRole('button', { name: '编辑', exact: true }).click()
    await page.getByPlaceholder('请输入美工作者名称').first().fill('画师新信息')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('button', { name: '保存', exact: true }).waitFor({ state: 'hidden' })
    const edited = submitted[2]
    assert.equal(edited.purchasedItems[0].artist, '画师新信息')
    assert(!Object.hasOwn(edited.purchasedItems[1], 'artist'))
    assert(!Object.hasOwn(edited.gifts[0], 'artist'))
    assert.match(await page.locator('main').innerText(), /美工作者：画师新信息/)
    console.log('PASS: existing order edit submits changed artist only; untouched categories do not overwrite it')
    assert.deepEqual(errors, [])
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
