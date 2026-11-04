// Style UI regression with mock APIs only; no real backend or data writes.
// NODE_PATH=/path/to/playwright/node_modules node scripts/test-style-ui.cjs
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { chromium } = require('playwright')
const base = 'http://127.0.0.1:5191'
const styles = ['食物系', '盐系', '可爱系', '花卉系', '复古系', '其他']
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="lightblue"/></svg>'
const image = { name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLfoAAAAASUVORK5CYII=', 'base64') }
const spec = { type: '大食量set', sequenceNumber: 1, quantity: 1, purchasePrice: 10, originalPrice: 20 }
const products = [
  ['old', '旧商品', '美工甲', '店铺甲'],
  ['food-a', '样品甲', '美工甲', '店铺甲', '食物系'],
  ['cute-a', '样品乙', '美工甲', '店铺甲', '可爱系'],
  ['food-b', '样品丙', '美工乙', '店铺乙', '食物系'],
  ['salt-a', '样品丁', '美工甲', '店铺乙', '盐系'],
  ['other-a', '样品戊', '美工甲', '店铺甲', '其他'],
  ['prefix', '样品己', '美工甲助手', '店铺丙', '食物系'],
  ...Array.from({ length: 150 }, (_, i) => [`long-${i + 1}`, `长列表商品${i + 1}`, '长列表美工', '长列表店铺', '花卉系']),
].map(([id, name, artist, shopName, style]) => ({ id, name, artist, shopName, ...(style ? { style } : {}), imagePath: `${id}.png`, thumbnailPath: `${id}.jpg`, createdAt: '2026-01-01' }))
const shops = [{ id: 'shop-a', name: '店铺甲', createdAt: '2026-01-01' }]
const submitted = []
let createdOrder
const productById = id => products.find(product => product.id === id)
const entry = (product, id, category = 'purchased') => ({ id, productId: product.id, product, category, specifications: [spec] })
function field(body, name) {
  return body.match(new RegExp(`name="${name}"[^\\r\\n]*\\r\\n(?:[^\\r\\n]+\\r\\n)*\\r\\n([\\s\\S]*?)\\r\\n--`))?.[1]
}
function oldOrder(id) {
  return { id, sequenceNumber: 1, orderType: 'shop', shopId: 'shop-a', shop: shops[0], totalAmount: 20, giftTotal: 20, smallGiftTotal: 0, giftRatio: 0,
    purchasedItems: [entry(products[0], 'old-item'), entry(products[1], 'food-item')],
    gifts: [{ ...entry(products[0], 'gift-item', 'gift'), giftType: '满赠礼' }], smallGifts: [],
  }
}
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('[data-scroll-loading]'))
  await page.waitForTimeout(150)
}
const filter = page => page.getByRole('group', { name: '风格分类筛选' })
const cardLinks = page => page.locator('main a[href^="/products/"]')
async function selectFilter(page, style) {
  await filter(page).getByRole('button', { name: style, exact: true }).click()
  await ready(page)
}

;(async () => {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5191', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] })
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
      if (request.method() === 'PATCH' && url.pathname.endsWith('/style')) {
        const product = productById(url.pathname.split('/')[3])
        const style = request.postDataJSON().style
        if (style) product.style = style
        else delete product.style
        data = product
      } else if (url.pathname === '/api/products/artists') {
        data = [...new Set(products.map(product => product.artist).filter(Boolean))]
      } else if (request.method() === 'GET' && url.pathname.endsWith('/relations')) {
        data = []
      } else if (url.pathname === '/api/products/search') {
        const type = url.searchParams.get('type')
        const keyword = (url.searchParams.get('keyword') || '').trim().toLowerCase()
        const style = url.searchParams.get('style')
        data = products.filter(product => {
          const name = (type === 'artist' ? product.artist || '' : type === 'shopName' ? product.shopName : product.name).toLowerCase()
          const matches = !keyword || (url.searchParams.get('exact') === 'true' ? name === keyword : name.includes(keyword))
          return matches && (!style || product.style === style)
        })
      } else if (url.pathname.startsWith('/api/products/')) {
        data = { ...productById(url.pathname.split('/').pop()), entries: { purchased: Array.from({ length: 20 }, () => ({
          orderId: 'old-order', orderSequence: 1, orderType: 'shop', shopName: '店铺甲', specifications: [spec],
        })), gifts: [], smallGifts: [] } }
      } else if (url.pathname.startsWith('/api/shops')) data = shops
      else if (url.pathname.startsWith('/api/wishes')) data = []
      else if (request.method() === 'POST' && (url.pathname === '/api/orders' || url.pathname === '/api/orders/group')) {
        const body = request.postData()
        const group = url.pathname.endsWith('/group')
        const groups = group ? JSON.parse(field(body, 'shops')) : [{ shopName: field(body, 'shopName'), items: JSON.parse(field(body, 'purchasedItems')) }]
        submitted.push({ groups })
        createdOrder = { id: `new-order-${submitted.length}`, sequenceNumber: 2, orderType: group ? 'group' : 'shop', groupSequenceNumber: 1,
          shop: group ? null : { name: groups[0].shopName }, shops: groups.map((group, index) => ({ id: `shop-${index}`, name: group.shopName })),
          purchasedItems: groups.flatMap((group, groupIndex) => group.items.map((item, index) => ({
            id: `new-item-${groupIndex}-${index}`, productId: 'new', shopId: `shop-${groupIndex}`, specifications: item.specifications,
            product: { id: 'new', name: item.productName, artist: item.artist, style: item.style, imagePath: 'new.png', thumbnailPath: 'new.jpg' },
          }))), gifts: [], smallGifts: [], totalAmount: 20, giftTotal: 0, smallGiftTotal: 0, giftRatio: 0,
        }
        data = { id: createdOrder.id }
      } else if (request.method() === 'PUT' && url.pathname.startsWith('/api/orders/')) {
        const body = request.postData()
        const payload = Object.fromEntries(['purchasedItems', 'gifts', 'smallGifts'].map(name => [name, JSON.parse(field(body, name))]))
        submitted.push(payload)
        for (const item of [...payload.purchasedItems, ...payload.gifts, ...payload.smallGifts]) {
          if (item.style !== undefined) productById(item.productId).style = item.style
        }
        data = { id: 'old-order' }
      } else if (url.pathname.startsWith('/api/orders/')) {
        const id = url.pathname.split('/').pop()
        data = createdOrder?.id === id ? createdOrder : oldOrder(id)
      } else return route.fulfill({ status: 500, json: { message: `Unexpected mock API ${request.method()} ${url.pathname}` } })
      await route.fulfill({ json: data })
    })

    await page.goto(base)
    await ready(page)
    assert.deepEqual(await filter(page).getByRole('button').allTextContents(), ['全部', ...styles])
    await selectFilter(page, '食物系')
    assert.equal(await cardLinks(page).count(), 3)
    const foodCard = page.locator('main a[href="/products/food-a"]').locator('..')
    assert(!await foodCard.innerText().then(text => text.includes('食物系')))
    await foodCard.getByRole('link', { name: '店铺甲', exact: true }).click()
    await ready(page)
    assert.equal(new URL(page.url()).searchParams.get('style'), '食物系')
    assert.equal(await cardLinks(page).count(), 1)
    await selectFilter(page, '盐系')
    assert.equal(await cardLinks(page).count(), 0)
    assert.equal(await page.locator('main select').inputValue(), 'shopName')
    assert.equal(await page.getByPlaceholder('输入关键词搜索...').inputValue(), '店铺甲')
    await selectFilter(page, '全部')
    assert.equal(await cardLinks(page).count(), 4)
    await page.reload()
    await ready(page)
    assert.equal(await cardLinks(page).count(), 4)
    assert.equal(await filter(page).getByRole('button', { name: '全部', exact: true }).getAttribute('aria-pressed'), 'true')
    console.log('PASS: six styles below search, no card style labels, shop+style intersection and scoped all')

    await page.goto(`${base}/?type=artist&keyword=${encodeURIComponent('美工甲')}&exact=true`)
    await ready(page)
    await selectFilter(page, '食物系')
    assert.equal(await cardLinks(page).count(), 1)
    await selectFilter(page, '可爱系')
    assert.equal(await cardLinks(page).count(), 1)
    assert.equal(await cardLinks(page).first().getAttribute('href'), '/products/cute-a')
    await selectFilter(page, '全部')
    assert.equal(await cardLinks(page).count(), 5)
    await page.locator('main select').selectOption('shopName')
    await page.getByPlaceholder('输入关键词搜索...').fill('店铺甲')
    await selectFilter(page, '可爱系')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await ready(page)
    assert.equal(await filter(page).getByRole('button', { name: '可爱系', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.equal(await cardLinks(page).count(), 1)
    console.log('PASS: artist/shop manual search and style stay combined, exact artist excludes similar names')

    await page.goto(`${base}/products/old`)
    await ready(page)
    assert.match(await page.locator('main').innerText(), /风格分类：未分类/)
    await page.getByRole('button', { name: '编辑风格分类', exact: true }).click()
    await page.getByLabel('风格分类（选填）', { exact: true }).selectOption('盐系')
    await page.getByRole('button', { name: '保存分类', exact: true }).click()
    await page.getByRole('button', { name: '编辑风格分类', exact: true }).waitFor()
    await page.reload()
    await ready(page)
    assert.match(await page.locator('main').innerText(), /风格分类：盐系/)
    assert.match(await page.locator('main').innerText(), /美工：美工甲/)
    await page.getByRole('button', { name: '编辑风格分类', exact: true }).click()
    await page.getByLabel('风格分类（选填）', { exact: true }).selectOption('')
    await page.getByRole('button', { name: '保存分类', exact: true }).click()
    await page.getByRole('button', { name: '编辑风格分类', exact: true }).waitFor()
    assert.match(await page.locator('main').innerText(), /风格分类：未分类/)
    console.log('PASS: old product classification saved/cleared independently of artist')

    await page.goto(`${base}/order-entry`)
    await page.getByPlaceholder('输入或选择店铺名').fill('新店铺')
    await page.getByRole('button', { name: '确认并进入下一步' }).click()
    await page.getByPlaceholder('请输入商品名称', { exact: true }).fill('新分类商品')
    await page.getByLabel('风格分类（选填）', { exact: true }).selectOption('复古系')
    await page.locator('input[type="file"]').setInputFiles(image)
    await page.getByLabel('大食量set', { exact: true }).check()
    await page.getByRole('button', { name: '进入下一步', exact: true }).click()
    await page.getByRole('button', { name: '进入下一步', exact: true }).click()
    await page.getByRole('button', { name: '录入完成', exact: true }).click()
    await page.waitForURL(`${base}/orders/new-order-1`)
    await ready(page)
    assert.equal(submitted[0].groups[0].items[0].style, '复古系')
    console.log('PASS: new shop order submits style')

    await page.goto(`${base}/group-order-entry`)
    await page.getByPlaceholder('输入或选择店铺名').fill('店铺甲')
    const productSelect = page.locator('main select').filter({ has: page.locator('option[value="food-a"]') })
    await productSelect.selectOption('food-a')
    assert.equal(await page.getByLabel('风格分类（选填）', { exact: true }).inputValue(), '食物系')
    await page.getByLabel('大食量set', { exact: true }).check()
    await page.getByRole('button', { name: '添加新店铺', exact: true }).click()
    await page.waitForTimeout(300)
    assert.equal(await page.getByLabel('风格分类（选填）', { exact: true }).inputValue(), '')
    await page.getByPlaceholder('输入或选择店铺名').fill('新拼单店铺')
    await page.getByPlaceholder('请输入商品名称', { exact: true }).fill('新拼单分类商品')
    await page.getByLabel('风格分类（选填）', { exact: true }).selectOption('花卉系')
    await page.locator('input[type="file"]').setInputFiles(image)
    await page.getByLabel('大食量set', { exact: true }).check()
    await page.getByRole('button', { name: '提交拼单订单', exact: true }).click()
    await page.waitForURL(`${base}/orders/new-order-2`)
    assert.equal(submitted[1].groups[0].items[0].style, '食物系')
    assert.equal(submitted[1].groups[1].items[0].style, '花卉系')
    console.log('PASS: group order copies existing style and separate new products can select another')

    await page.goto(`${base}/orders/old-order`)
    await ready(page)
    await page.locator('section').filter({ has: page.getByRole('heading', { name: '已购商品', exact: true }) }).getByRole('button', { name: '编辑', exact: true }).click()
    await page.getByLabel('风格分类（选填）', { exact: true }).first().selectOption('可爱系')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('button', { name: '保存', exact: true }).waitFor({ state: 'hidden' })
    assert.equal(submitted[2].purchasedItems[0].style, '可爱系')
    assert(!Object.hasOwn(submitted[2].purchasedItems[1], 'style'))
    assert(!Object.hasOwn(submitted[2].gifts[0], 'style'))
    assert(!Object.hasOwn(submitted[2].purchasedItems[0], 'artist'))
    console.log('PASS: existing order edit sends only changed style, never overwrites unrelated metadata')

    const scope = `/?type=artist&keyword=${encodeURIComponent('长列表美工')}&exact=true`
    await page.goto(`${base}${scope}`)
    await ready(page)
    await selectFilter(page, '花卉系')
    for (let i = 0; i < 2; i++) {
      await page.getByText('加载更多...', { exact: true }).scrollIntoViewIfNeeded()
      await page.waitForTimeout(250)
    }
    const deep = page.locator('main a[href="/products/long-100"]')
    await deep.scrollIntoViewIfNeeded()
    await page.waitForTimeout(100)
    const y = await page.evaluate(() => window.scrollY)
    assert(y > 1000)
    await deep.click()
    await ready(page)
    await page.getByRole('button', { name: '返回上一页', exact: true }).click()
    await page.waitForURL(`${base}${scope}`)
    await ready(page)
    await page.waitForFunction(y => Math.abs(window.scrollY - y) <= 2, y)
    assert.equal(await filter(page).getByRole('button', { name: '花卉系', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.equal(await page.getByPlaceholder('输入关键词搜索...').inputValue(), '长列表美工')
    await page.reload()
    await ready(page)
    await page.waitForFunction(y => Math.abs(window.scrollY - y) <= 2, y)
    assert.equal(await filter(page).getByRole('button', { name: '花卉系', exact: true }).getAttribute('aria-pressed'), 'true')
    console.log('PASS: artist+style, loaded batches and deep scroll position restored on return and reload')
    assert.deepEqual(errors, [])
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
