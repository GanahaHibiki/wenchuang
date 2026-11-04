// NODE_PATH=/path/to/playwright/node_modules node scripts/test-artist-autocomplete-ui.cjs
// Mock APIs only, no real backend or user data.
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { chromium } = require('playwright')
const base = 'http://127.0.0.1:5193'
const product = { id: 'a', name: '测试商品', imagePath: 'a.png', thumbnailPath: 'a.jpg', createdAt: '2026-01-01' }
let names = ['画师甲', '画师乙', 'Alice']
let failed = false
let reads = 0
let patches = 0

;(async () => {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5193', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let browser
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Vite startup timeout')), 20000)
      server.stdout.on('data', data => { if (data.toString().includes('Local:')) { clearTimeout(timer); resolve() } })
      server.on('exit', code => { clearTimeout(timer); reject(new Error(`Vite exit ${code}`)) })
      server.stderr.on('data', data => process.stderr.write(data))
    })
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/images/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"/>' }))
    await page.route('**/api/**', async route => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      if (!pathname.startsWith('/api/')) return route.continue()
      if (pathname === '/api/products/artists') {
        reads++
        if (failed) return route.fulfill({ status: 500, json: { message: 'synthetic unavailable' } })
        return route.fulfill({ json: names })
      }
      if (pathname.endsWith('/artist') && request.method() === 'PATCH') {
        patches++
        product.artist = request.postDataJSON().artist
        if (product.artist && !names.includes(product.artist)) names.push(product.artist)
        return route.fulfill({ json: product })
      }
      return route.fulfill({ json: { ...product, entries: { purchased: [], gifts: [], smallGifts: [] } } })
    })
    await page.goto(`${base}/products/a`)
    await page.getByRole('button', { name: '编辑美工', exact: true }).click()
    assert.equal(reads, 0, 'Candidate names load only on focus, not editor mount')
    const input = page.getByPlaceholder('请输入美工名称')
    const list = page.getByRole('listbox', { name: '已录入美工' })
    await input.click()
    await list.waitFor()
    await list.getByRole('option', { name: '画师乙', exact: true }).click()
    assert.equal(await input.inputValue(), '画师乙')
    assert.equal(patches, 0)
    await input.click()
    await list.waitFor()
    await input.press('Escape')
    await page.getByRole('button', { name: '保存美工', exact: true }).click()
    await page.getByRole('link', { name: '画师乙', exact: true }).waitFor()
    console.log('PASS: focus loads recorded candidates; mouse selection fills and saves artist')

    await page.getByRole('button', { name: '编辑美工', exact: true }).click()
    await input.focus()
    await list.waitFor()
    const previousReads = reads
    await input.fill('画师甲')
    assert.deepEqual(await list.getByRole('option').allTextContents(), ['画师甲'])
    await input.press('ArrowDown')
    await input.press('Enter')
    assert.equal(await input.inputValue(), '画师甲')
    assert.equal(patches, 1, 'Enter selects highlighted candidate, not submit the form')
    await input.press('ArrowDown')
    await list.waitFor()
    await input.press('Escape')
    assert.equal(await list.count(), 0)
    assert.equal(await input.inputValue(), '画师甲')
    assert.equal(reads, previousReads, 'Typing filters locally without per-keystroke API requests')
    console.log('PASS: local filtering, arrow/Enter selection, Escape close, no accidental form submit')

    await input.fill('全新美工')
    assert.equal(await input.inputValue(), '全新美工')
    const newSave = page.waitForResponse(response => response.request().method() === 'PATCH')
    await page.getByRole('button', { name: '保存美工', exact: true }).click()
    await newSave
    assert.equal(product.artist, '全新美工')
    await page.getByRole('link', { name: '全新美工', exact: true }).waitFor()
    await page.getByRole('button', { name: '编辑美工', exact: true }).click()
    await input.focus()
    await list.waitFor()
    await input.fill('')
    assert.equal(await list.getByRole('option', { name: '全新美工', exact: true }).count(), 1)
    await input.press('Escape')
    await page.getByRole('button', { name: '取消', exact: true }).click()
    console.log('PASS: manual new names remain supported and appear on next focus')

    failed = true
    await page.getByRole('button', { name: '编辑美工', exact: true }).click()
    await input.focus()
    await page.getByRole('alert').filter({ hasText: '候选加载失败' }).waitFor()
    await input.fill('失败时仍可手填')
    await page.getByRole('button', { name: '保存美工', exact: true }).click()
    await page.getByRole('link', { name: '失败时仍可手填', exact: true }).waitFor()
    console.log('PASS: failed candidate fetch does not block manual editing or saving')

    failed = false
    names = Array.from({ length: 70 }, (_, index) => `候选${index}`)
    await page.getByRole('button', { name: '编辑美工', exact: true }).click()
    await input.focus()
    await input.fill('')
    await page.waitForFunction(() => document.querySelectorAll('[role="listbox"] [role="option"]').length === 50)
    assert.equal(await list.getByRole('option').count(), 50)
    await input.fill('候选69')
    assert.equal(await list.getByRole('option').count(), 1)
    console.log('PASS: candidate render capped at 50, remaining names selectable through filtering')
    assert.deepEqual(errors, [])
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
