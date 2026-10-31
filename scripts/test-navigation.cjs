/*
 * Navigation regression tests with mock APIs only (no real backend/data).
 * Requires Playwright resolvable through NODE_PATH or a local installation.
 * Run: NODE_PATH=/path/to/playwright/node_modules node scripts/test-navigation.cjs
 */
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { chromium } = require('playwright')

const port = 5187
const base = `http://127.0.0.1:${port}`
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="lightblue"/></svg>'
const spec = { type: '大食量set', sequenceNumber: 1, quantity: 1, purchasePrice: 10, originalPrice: 15 }
const products = Array.from({ length: 240 }, (_, i) => ({
  id: `product-${i + 1}`, name: `商品${i + 1}`, shopName: '测试店铺',
  imagePath: `${i + 1}.png`, thumbnailPath: `${i + 1}_thumb.jpg`, createdAt: '2026-01-01',
}))
const orders = Array.from({ length: 180 }, (_, i) => ({
  id: `order-${i + 1}`, sequenceNumber: i + 1, orderType: 'shop', shopName: `店铺${i + 1}`,
  totalAmount: i + 1, giftTotal: 0, smallGiftTotal: 0, giftRatio: 0,
}))

async function installMocks(page) {
  await page.route('**/images/**', route => route.fulfill({ contentType: 'image/svg+xml', body: image }))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    // Delay responses to ensure scroll restoration waits for asynchronous DOM.
    await new Promise(resolve => setTimeout(resolve, 100))
    let data
    if (url.pathname === '/api/orders') {
      data = [...orders]
      if (url.searchParams.get('sortBy')) {
        const field = url.searchParams.get('sortBy')
        data.sort((a, b) => url.searchParams.get('order') === 'desc' ? b[field] - a[field] : a[field] - b[field])
      }
    } else if (url.pathname.startsWith('/api/orders/')) {
      const id = url.pathname.split('/').pop()
      data = {
        ...orders.find(order => order.id === id), shopId: 'shop-1', createdAt: '2026-01-01',
        shop: { id: 'shop-1', name: '测试店铺', createdAt: '2026-01-01' },
        purchasedItems: products.slice(0, 45).map(product => ({
          id: `item-${product.id}`, productId: product.id, category: 'purchased', product, specifications: [spec],
        })), gifts: [], smallGifts: [],
      }
    } else if (url.pathname === '/api/products/search') {
      data = products
    } else if (url.pathname === '/api/products/set-products') {
      data = products.map(product => ({
        productId: product.id, productName: product.name, ...product,
        大食量set: 1, 小食量set: 0, 试吃set: 0,
      }))
    } else if (url.pathname === '/api/products/loose-items') {
      data = products.map(product => ({
        productId: product.id, productName: product.name, ...product,
        折页: 1, 异形折页: 0, 卡头: {}, 卡背: 0, 封口贴: {}, 长贴: {}, 其他贴纸: {},
        贴纸包: 0, 封箱贴: 0, 豆丁贴: 0, gift贴: 0, 售后卡: 0, 磨砂盒: 0, 其他衍生: {},
      }))
    } else if (url.pathname.startsWith('/api/products/')) {
      const product = products.find(product => product.id === url.pathname.split('/').pop())
      data = { ...product, entries: {
        purchased: Array.from({ length: 35 }, () => ({
          orderId: 'order-120', orderSequence: 120, orderType: 'shop', shopName: '测试店铺', specifications: [spec],
        })), gifts: [], smallGifts: [],
      } }
    } else if (url.pathname.startsWith('/api/wishes')) {
      data = products.map(product => ({ ...product, productId: product.id, productName: product.name, shopId: 'shop-1' }))
    } else if (url.pathname.startsWith('/api/shops')) {
      data = [{ id: 'shop-1', name: '测试店铺', createdAt: '2026-01-01' }]
    } else {
      return route.fulfill({ status: 500, json: { message: `Unexpected mock API: ${url.pathname}` } })
    }
    await route.fulfill({ json: data })
  })
}

async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('[data-scroll-loading]'))
  await page.waitForTimeout(200)
}
async function scroll(page, y) {
  await page.evaluate(y => window.scrollTo(0, y), y)
  await page.waitForTimeout(100)
  return page.evaluate(() => window.scrollY)
}
async function assertPosition(page, expected) {
  await page.waitForFunction(expected => Math.abs(window.scrollY - expected) <= 2, expected)
}
async function follow(page, link) {
  await link.scrollIntoViewIfNeeded()
  await page.waitForTimeout(100)
  const y = await page.evaluate(() => window.scrollY)
  await link.click()
  await ready(page)
  return y
}
async function back(page, path, y) {
  await page.getByRole('button', { name: '返回上一页', exact: true }).click()
  await page.waitForURL(`${base}${path}`)
  await ready(page)
  await assertPosition(page, y)
}

;(async () => {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
  })
  let browser
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Vite startup timeout')), 20000)
      server.on('exit', code => { clearTimeout(timeout); reject(new Error(`Vite exited: ${code}`)) })
      server.stdout.on('data', data => {
        if (data.toString().includes('Local:')) { clearTimeout(timeout); resolve() }
      })
      server.stderr.on('data', data => process.stderr.write(data))
    })
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await installMocks(page)

    await page.goto(`${base}/orders`)
    await ready(page)
    const row = page.getByRole('cell', { name: '店铺100', exact: true })
    const ordersY = await follow(page, row)
    await page.waitForURL(`${base}/orders/order-100`)
    assert(ordersY > 1000)
    assert.equal(await page.evaluate(() => window.scrollY), 0)
    await back(page, '/orders', ordersY)
    console.log('PASS: order #100 returns to the same list position')

    await row.click()
    await ready(page)
    const detailY = await follow(page, page.locator('main a[href^="/products/"]').nth(20))
    const productPath = new URL(page.url()).pathname + new URL(page.url()).search
    const productY = await follow(page, page.locator('main a[href="/orders/order-120"]').nth(12))
    await back(page, productPath, productY)
    await back(page, '/orders/order-100', detailY)
    await back(page, '/orders', ordersY)
    console.log('PASS: order → product → other order returns through actual history and all positions')

    await page.getByRole('columnheader', { name: /订单金额/ }).click()
    await ready(page)
    const sortedY = await follow(page, row)
    await back(page, '/orders', sortedY)
    assert.match(await page.getByRole('columnheader', { name: /订单金额/ }).innerText(), /⬇️/)
    await page.goForward()
    await ready(page)
    await page.goBack()
    await ready(page)
    await assertPosition(page, sortedY)
    await page.reload()
    await ready(page)
    await assertPosition(page, sortedY)
    console.log('PASS: sort, browser back/forward and reload retain the list view')

    await row.click()
    await ready(page)
    const slowOrders = async route => {
      if (new URL(route.request().url()).pathname !== '/api/orders') return route.fallback()
      await new Promise(resolve => setTimeout(resolve, 11000))
      await route.fulfill({ json: [...orders].reverse() })
    }
    await page.route('**/api/orders*', slowOrders)
    await back(page, '/orders', sortedY)
    await page.unroute('**/api/orders*', slowOrders)
    console.log('PASS: scroll restoration survives API loading longer than ten seconds')

    await page.goto(base)
    await ready(page)
    await page.getByPlaceholder('输入关键词搜索...').fill('商品')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await ready(page)
    for (let i = 0; i < 2; i++) {
      await page.getByText('加载更多...', { exact: true }).scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
    }
    const galleryY = await follow(page, page.locator('main a').filter({ hasText: /^商品100$/ }))
    await back(page, '/', galleryY)
    assert.equal(await page.getByPlaceholder('输入关键词搜索...').inputValue(), '商品')
    assert(await page.locator('main a').count() >= 100)
    console.log('PASS: searched, expanded gallery returns to its previous position')

    await page.goto(`${base}/set-products`)
    await ready(page)
    await page.locator('main button.absolute').first().click()
    const setY = await follow(page, page.locator('main a[href^="/products/"]').nth(80))
    await back(page, '/set-products', setY)
    assert.match(await page.locator('main').innerText(), /已选择\s*1\s*\/ 9/)
    console.log('PASS: Set gallery returns to position and retains image selection')

    await page.goto(`${base}/loose-items`)
    await ready(page)
    await page.getByRole('button', { name: '折页', exact: true }).click()
    await ready(page)
    const loosePath = new URL(page.url()).pathname + new URL(page.url()).search
    const looseY = await follow(page, page.locator('main a[href^="/products/"]').nth(80))
    await back(page, loosePath, looseY)
    assert.equal(await page.getByRole('button', { name: '折页', exact: true }).getAttribute('class').then(x => x.includes('bg-blue-600')), true)
    console.log('PASS: filtered loose-items gallery retains filter and position')

    await page.goto(`${base}/wishes`)
    await ready(page)
    await page.getByPlaceholder('输入关键词搜索...').fill('商品')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await ready(page)
    await page.getByText('加载更多...', { exact: true }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    const wishY = await scroll(page, 1800)
    const wishPath = new URL(page.url()).pathname + new URL(page.url()).search
    await page.locator('aside a[href="/orders"]').click()
    await ready(page)
    await page.goBack()
    await ready(page)
    await assertPosition(page, wishY)
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, wishPath)
    assert.equal(await page.getByPlaceholder('输入关键词搜索...').inputValue(), '商品')
    assert(await page.locator('main .group').count() >= 100)
    console.log('PASS: wishlist browser back retains search, batches and position')

    const direct = await browser.newPage()
    await installMocks(direct)
    await direct.goto(`${base}/products/product-1`)
    await ready(direct)
    await direct.getByRole('button', { name: '返回上一页', exact: true }).click()
    await direct.waitForURL(`${base}/`)
    await ready(direct)
    console.log('PASS: direct-open detail safely falls back when there is no in-app previous page')
    assert.deepEqual(errors, [])
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
