/* Browser regression: starts Vite only; every API is mocked. No real data/backend. */
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const { chromium } = require('playwright')
const port = 5192
const base = `http://127.0.0.1:${port}`
const orders = Array.from({ length: 100 }, (_, i) => ({
  id: `o${i}`, sequenceNumber: i + 1, orderType: i < 60 ? 'shop' : 'group', shopName: `测试订单${i}`,
  totalAmount: i + 1, giftTotal: 0, smallGiftTotal: 0, giftRatio: 0, note: '普通备注，重要内容，结尾',
}))
const patches = []
let failNext = false

;(async () => {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
  })
  let browser
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Vite timeout')), 20000)
      server.on('exit', code => { clearTimeout(timeout); reject(new Error(`Vite exit ${code}`)) })
      server.stdout.on('data', data => { if (data.toString().includes('Local:')) { clearTimeout(timeout); resolve() } })
      server.stderr.on('data', data => process.stderr.write(data))
    })
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
    const errors = []
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
    page.on('dialog', async dialog => { errors.push(`Unexpected dialog: ${dialog.message()}`); await dialog.dismiss() })
    await page.route('**/api/**', async route => {
      const req = route.request()
      const url = new URL(req.url())
      if (!url.pathname.startsWith('/api/')) return route.continue()
      if (req.method() === 'PATCH') {
        patches.push({ path: url.pathname, body: req.postDataJSON() })
        await new Promise(resolve => setTimeout(resolve, 100))
        if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { message: '模拟失败' } }) }
        const order = orders.find(o => o.id === url.pathname.split('/')[3])
        Object.assign(order, req.postDataJSON())
        return route.fulfill({ json: order })
      }
      if (url.pathname === '/api/orders') return route.fulfill({ json: orders })
      return route.fulfill({ status: 500, json: { message: 'Unexpected API' } })
    })
    await page.goto(`${base}/orders`)
    await page.getByRole('cell', { name: '测试订单0', exact: true }).waitFor().catch(async error => {
      console.error(await page.locator('body').innerText())
      throw error
    })
    const tables = page.locator('table')
    await page.waitForTimeout(400)
    await page.evaluate(() => window.scrollTo(0, 600))
    await page.waitForTimeout(100)
    const headers = await tables.nth(0).locator('th').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().top))
    assert.ok(headers.every(y => Math.abs(y) <= 2), `Shop header positions: ${headers}`)
    const groupTop = await tables.nth(1).evaluate(table => table.getBoundingClientRect().top + window.scrollY)
    await page.evaluate(y => window.scrollTo(0, y + 300), groupTop)
    await page.waitForTimeout(100)
    assert.ok((await tables.nth(1).locator('th').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().top))).every(y => Math.abs(y) <= 2))
    console.log('PASS: all 11 headers sticky for shop and group tables during window scrolling')

    await page.evaluate(() => window.scrollTo(0, 0))
    const row = tables.nth(0).locator('tbody tr').first()
    const timeCell = row.locator('td').nth(6)
    await timeCell.click()
    const time = page.getByRole('textbox', { name: '编辑下单时间' })
    await time.fill('2026-02-30 12:00:00')
    await time.press('Enter')
    await page.getByRole('alert').waitFor()
    assert.equal(patches.length, 0)
    await time.press('Tab')
    await time.click()
    assert.equal(await time.inputValue(), '2026-02-30 12:00:00')
    await time.fill('２０２６－０２－０３　１２：３４：５６')
    assert.equal(await time.inputValue(), '2026-02-03 12:34:56')
    await time.press('Enter')
    await time.waitFor({ state: 'detached' })
    assert.equal(patches.length, 1)
    assert.equal(new Date(patches[0].body.orderTime).getSeconds(), 56)
    await timeCell.click()
    await time.fill('bad')
    await time.press('Tab')
    await page.getByRole('alert').waitFor()
    await time.fill('2026-02-04 01:02:03')
    failNext = true
    await time.press('Enter')
    await page.getByText('下单时间保存失败，请重试').waitFor()
    await time.press('Enter')
    await time.waitFor({ state: 'detached' })
    await timeCell.click()
    await time.fill('')
    await time.press('Tab')
    await time.waitFor({ state: 'detached' })
    assert.equal(await timeCell.innerText(), '')
    console.log('PASS: invalid Enter/blur can re-edit, full-width conversion, HTTP retry, empty clear and single PATCH per save')

    const noteCell = row.locator('td').nth(10)
    await noteCell.click()
    const note = page.getByRole('textbox', { name: '编辑备注' })
    await note.evaluate(input => input.setSelectionRange(5, 9))
    const beforeMark = patches.length
    await page.getByRole('button', { name: '标红选中', exact: true }).click()
    assert.equal(patches.length, beforeMark, 'Mark button must not blur-save')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await note.waitFor({ state: 'detached' })
    assert.equal(patches.length, beforeMark + 1)
    assert.equal(await noteCell.locator('span.text-red-600').innerText(), '重要内容')
    await page.reload()
    await page.getByRole('cell', { name: '测试订单0', exact: true }).waitFor()
    assert.equal(await noteCell.locator('span.text-red-600').innerText(), '重要内容')
    await noteCell.click()
    await note.evaluate(input => input.setSelectionRange(6, 8))
    await page.getByRole('button', { name: '取消选中标红', exact: true }).click()
    await note.press('Enter')
    await note.waitFor({ state: 'detached' })
    assert.deepEqual(await noteCell.locator('span.text-red-600').allTextContents(), ['重', '容'])
    await noteCell.click()
    await note.press('Home')
    await note.press('x')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await note.waitFor({ state: 'detached' })
    assert.deepEqual(orders[0].noteHighlights, [{ start: 6, end: 7 }, { start: 9, end: 10 }])
    await noteCell.click()
    const beforeCancel = patches.length
    await note.fill('取消内容')
    await note.press('Escape')
    await note.waitFor({ state: 'detached' })
    assert.equal(patches.length, beforeCancel)
    await noteCell.click()
    await note.fill('保存失败保留草稿')
    failNext = true
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByText('备注保存失败，请重试').waitFor()
    assert.equal(await note.inputValue(), '保存失败保留草稿')
    await note.press('Enter')
    await note.waitFor({ state: 'detached' })
    await noteCell.click()
    await note.fill('失焦保存')
    await page.getByRole('heading', { name: '订单总览', exact: true }).click()
    await note.waitFor({ state: 'detached' })
    assert.equal(await noteCell.innerText(), '失焦保存')
    console.log('PASS: partial red mark/remove, reload persistence, insertion offsets, Escape, blur save and failed-save retry')

    // Preserve an illustrative partially marked note for the screenshot.
    const groupRow = tables.nth(1).locator('tbody tr').first()
    await groupRow.locator('td').nth(10).click()
    await note.evaluate(input => input.setSelectionRange(5, 9))
    await page.getByRole('button', { name: '标红选中', exact: true }).click()
    await note.press('Enter')
    await note.waitFor({ state: 'detached' })
    await page.evaluate(y => window.scrollTo(0, y + 120), groupTop)
    await page.waitForTimeout(100)
    // Mark a visible group note as well.
    orders[63].noteHighlights = [{ start: 5, end: 9 }]
    await page.reload()
    await page.getByRole('cell', { name: '测试订单63', exact: true }).waitFor()
    await page.evaluate(y => window.scrollTo(0, y + 120), groupTop)
    await page.waitForTimeout(200)
    fs.mkdirSync('artifacts', { recursive: true })
    await page.screenshot({ path: 'artifacts/order-overview.png' })
    assert.deepEqual(errors, [])
    assert.equal(new URL(page.url()).pathname, '/orders', 'Editors must not navigate to detail')
    console.log('All order overview browser regressions passed; screenshot: artifacts/order-overview.png')
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
