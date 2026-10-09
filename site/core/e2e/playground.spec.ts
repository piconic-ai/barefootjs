/**
 * E2E coverage for the playground.
 *
 * The playground compiles the editor buffer inside a browser Worker that
 * bundles the whole compiler, so a Node-only global reached on the compile
 * path (e.g. `process`) is invisible to the unit suite and only shows up
 * here, as "Build failed" on first load. The preview iframe then mounts the
 * compiled component with the standalone runtime, which this test exercises
 * by clicking the Counter's +1 button.
 */

import { test, expect } from '@playwright/test'

test.describe('playground', () => {
  // Monaco loads from a CDN and the compiler worker is a multi-MB bundle;
  // give first load more headroom than the config default.
  test.setTimeout(60_000)

  test('compiles the default Counter in the browser and the preview is interactive', async ({ page }) => {
    await page.goto('/playground')

    const status = page.locator('#pg-status')
    await expect(status).toHaveText(/Preview up to date/, { timeout: 45_000 })
    await expect(page.locator('#pg-error')).toBeHidden()

    const preview = page.frameLocator('#pg-preview')
    await expect(preview.locator('#playground-error')).toBeHidden()
    await expect(preview.locator('p')).toHaveText('Count: 0')
    await preview.getByRole('button', { name: '+1' }).click()
    await expect(preview.locator('p')).toHaveText('Count: 1')
  })
})

test.describe('playground editor types', () => {
  test.setTimeout(60_000)

  // The type bundle is registered with Monaco's TypeScript worker as extra
  // libs; this asks that worker for the hover text the user sees. A bundle
  // that fails to resolve `@barefootjs/client` shows `const count: any`
  // here with no diagnostic anywhere, so the hover is the only observable.
  test('hover on the default source shows real signal types', async ({ page }) => {
    await page.goto('/playground')
    await expect(page.locator('#pg-status')).toHaveText(/Preview up to date/, { timeout: 45_000 })

    const hover = await page.evaluate(async () => {
      const monaco = (window as any).monaco
      const model = monaco.editor.getModels().find((m: any) => m.uri.path.endsWith('component.tsx'))
      const worker = await (await monaco.languages.typescript.getTypeScriptWorker())(model.uri)
      const quickInfo = async (needle: string) => {
        const offset = model.getValue().indexOf(needle)
        const info = await worker.getQuickInfoAtPosition(model.uri.toString(), offset + 1)
        return info?.displayParts?.map((p: any) => p.text).join('') ?? ''
      }
      return { count: await quickInfo('count()'), createSignal: await quickInfo('createSignal(') }
    })
    // Monaco's bundled TypeScript may print the `Reactive<…>` alias expanded;
    // the accessor signature is what proves the import resolved.
    expect(hover.count).toMatch(/^const count: (Reactive<)?\(\) => number>?$/)
    expect(hover.createSignal).toContain('createSignal<number>(initialValue: number')
  })
})
