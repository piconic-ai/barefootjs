import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

await page.goto('http://localhost:3000/blog/first-route')
await page.locator('#persistent-shell').evaluate((element) => {
  ;(element as Element & { __exampleIdentity?: string }).__exampleIdentity = 'preserved'
})

await page.getByRole('link', { name: 'A persistent shell' }).click()
await page.waitForURL('**/blog/persistent-shell')

const shellIdentity = await page.locator('#persistent-shell').evaluate(
  (element) => (element as Element & { __exampleIdentity?: string }).__exampleIdentity,
)
if (shellIdentity !== 'preserved') throw new Error('The partial navigation replaced the shell')

await page.screenshot({ path: 'packages/router/example/blog-example.png', fullPage: true })
await browser.close()
