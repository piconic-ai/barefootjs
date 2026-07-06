/**
 * Sanity check: measures the cost of a bare double-rAF fence (no app work)
 * with and without vsync-unlocking Chromium flags. Used to validate the
 * timing methodology; not part of the benchmark suite itself.
 */
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
const executablePath = join(browsersPath, 'chromium')

async function fenceFloor(args: string[]): Promise<number[]> {
  const browser = await chromium.launch({ headless: true, executablePath, args })
  const page = await browser.newPage()
  await page.setContent('<!DOCTYPE html><html><body><div id="x">hello</div></body></html>')
  const samples = await page.evaluate(async () => {
    const fence = () =>
      new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    // warmup
    for (let i = 0; i < 10; i++) await fence()
    const out: number[] = []
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now()
      // touch the DOM so a real invalidation/paint is in play
      document.getElementById('x')!.textContent = `hello ${i}`
      await fence()
      out.push(performance.now() - t0)
    }
    return out
  })
  await browser.close()
  return samples
}

function summarize(label: string, xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const med = s[Math.floor(s.length / 2)]
  console.log(`${label}: median=${med.toFixed(2)}ms min=${s[0].toFixed(2)} max=${s[s.length - 1].toFixed(2)}`)
}

const combos: [string, string[]][] = [
  ['default flags        ', []],
  ['vsync-unlocked flags ', ['--disable-gpu-vsync', '--disable-frame-rate-limit']],
  ['+compositor stages   ', ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--run-all-compositor-stages-before-draw']],
  ['+disable-gpu         ', ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-gpu']],
  ['angle swiftshader    ', ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--use-angle=swiftshader']],
]
for (const [label, flags] of combos) {
  try {
    summarize(label, await fenceFloor(flags))
  } catch (e) {
    console.log(`${label}: FAILED (${(e as Error).message.split('\n')[0]})`)
  }
}
