import { test, expect, request as pwRequest } from '@playwright/test'

test('home loads', async ({ page }) => {
  await page.goto('/')
  expect(page.url()).toContain('fly.dev')
  const body = await page.locator('body').textContent()
  expect(body && body.length).toBeGreaterThan(50)
})

test('new campaign form renders', async ({ page }) => {
  await page.goto('/new')
  await expect(page.locator('form[action="/api/campaigns"]')).toBeVisible()
  await expect(page.locator('input[name="title"]')).toBeVisible()
})

test('campaign create → kanban → prospect reaches sent', async ({ page, browser }) => {
  test.setTimeout(8 * 60 * 1000)

  await page.goto('/new')
  const stamp = Date.now()
  await page.fill('input[name="title"]', `e2e ${stamp}`)

  await Promise.all([
    page.waitForURL(/\/campaign\/c_[a-f0-9]+/),
    page.locator('form[action="/api/campaigns"] [type="submit"], form[action="/api/campaigns"] button').first().click(),
  ])

  const campaignUrl = new URL(page.url())
  const campaignId = campaignUrl.pathname.split('/').pop()!
  console.log('[e2e] campaign', campaignId)

  // Poll the board partial directly — it's server-rendered columns in a fixed order.
  // Columns (0-indexed): discovered, scored, qualified, researched, drafted, sent, lost, parked
  const ctx = await pwRequest.newContext({ baseURL: campaignUrl.origin })
  const deadline = Date.now() + 6 * 60 * 1000
  let sentCount = 0
  let lastCounts = ''

  while (Date.now() < deadline) {
    const res = await ctx.get(`/campaign/${campaignId}/board`)
    expect(res.ok(), `board fetch ${res.status()}`).toBeTruthy()
    const html = await res.text()

    // Parse counts from col-head spans: `<span>Label</span><span ...>N</span>`
    const labels = ['Discovered','Scored','Qualified','Researched','Drafted','Sent','Lost','Parked']
    const counts = labels.map(label => {
      const re = new RegExp(`>${label}<[^]*?<span[^>]*>(\\d+)</span>`, 'i')
      const m = html.match(re)
      return m ? parseInt(m[1], 10) : 0
    })
    const counted = Object.fromEntries(labels.map((l, i) => [l.toLowerCase(), counts[i]]))
    sentCount = counted.sent
    const repr = labels.map((l, i) => `${l[0]}${counts[i]}`).join(' ')
    if (repr !== lastCounts) { console.log('[e2e]', repr); lastCounts = repr }

    if (sentCount > 0) break
    await new Promise(r => setTimeout(r, 5000))
  }

  await ctx.dispose()
  expect(sentCount, 'no prospect reached Sent within 6min').toBeGreaterThan(0)
})
