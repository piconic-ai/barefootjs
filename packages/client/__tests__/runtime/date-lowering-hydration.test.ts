/**
 * #2640/#2641: a catalogued Date method call inside `/* @client *​/` (text
 * position) or a reactive attribute binding (`/* @client *​/` or not) must
 * not throw at real hydrate. SSR fixture conformance (`packages/adapter-
 * tests`) can't observe this — the bug is entirely in the CLIENT JS, never
 * in SSR output — so this executes the real hydrate leg against a real DOM,
 * the same way `issue-1725-hydration.test.ts` / `issue-2289-hydration.test.ts`
 * do: compile with the real Hono adapter, render real SSR HTML (which JSON-
 * serializes the `Date` prop to its ISO string — the exact de-riched shape
 * a real backend's `bf-p` payload carries), drop it into `document.body`,
 * then `rehydrateAll()` + `flushHydration()` and assert no throw plus the
 * correct final DOM state.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { renderHonoComponent } from '../../../adapter-hono/src/test-render'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
import { writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const adapter = new TestAdapter()
const runtimePath = join(__dirname, '../../src/runtime/index.ts')

function clientJsFor(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compile errors in ${filename}:\n${errors.map(e => `${e.code}: ${e.message}`).join('\n')}`)
  }
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error(`No client JS for ${filename}`)
  return clientJs.replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
}

async function hydrate(
  source: string,
  filename: string,
  componentName: string,
  createdAt: Date,
  extraProps: Record<string, unknown> = {},
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'bf-2640-'))
  const file = join(dir, `${componentName}.mjs`)
  writeFileSync(file, clientJsFor(source, filename))
  await import(file)

  const ssrHtml = await renderHonoComponent({
    adapter: new HonoAdapter(),
    source,
    componentName,
    // `__instanceId` must be `Name_xxx` shaped — `hydrateElementScope`'s
    // `scopeName()` splits on the first `_` to find the registered
    // component name; a bare id with no underscore (the default) never
    // resolves and the walk silently skips the scope.
    props: { __instanceId: `${componentName}_test`, createdAt, ...extraProps },
  })
  // Sanity: the prop really did cross as a de-riched ISO string, not a
  // live Date instance — otherwise this test would prove nothing.
  expect(ssrHtml).toContain(createdAt.toISOString())

  document.body.innerHTML = ssrHtml
  const { rehydrateAll, flushHydration } = await import(runtimePath)
  rehydrateAll()
  flushHydration()
}

describe('#2640 — /* @client */ text: catalogued Date call does not throw at hydrate', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('renders the ISO string via date(), no TypeError', async () => {
    const source = `
export function DateClientText({ createdAt }: { createdAt: Date }) {
  return <div>{/* @client */ createdAt.toISOString()}</div>
}
`
    const createdAt = new Date('2024-01-01T00:00:00.000Z')
    await hydrate(source, 'DateClientText.tsx', 'DateClientText', createdAt)

    expect(document.querySelector('div')!.textContent).toBe(createdAt.toISOString())
  })
})

describe('#2641 — reactive attribute: catalogued Date call does not throw at hydrate', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('/* @client */ attribute renders the ISO string via date(), no TypeError', async () => {
    const source = `
export function DateClientAttr({ createdAt }: { createdAt: Date }) {
  return <div data-iso={/* @client */ createdAt.toISOString()} />
}
`
    const createdAt = new Date('2024-01-01T00:00:00.000Z')
    await hydrate(source, 'DateClientAttr.tsx', 'DateClientAttr', createdAt)

    expect(document.querySelector('div')!.getAttribute('data-iso')).toBe(createdAt.toISOString())
  })

  test('non-@client reactive attribute keeps its correct value after the re-sync effect runs', async () => {
    const source = `
export function DateAttrNoDirective({ createdAt, label }: { createdAt: Date; label: string }) {
  return <time data-iso={createdAt.toISOString()}>{label}</time>
}
`
    const createdAt = new Date('2024-01-01T00:00:00.000Z')
    await hydrate(source, 'DateAttrNoDirective.tsx', 'DateAttrNoDirective', createdAt, { label: 'hi' })

    expect(document.querySelector('time')!.getAttribute('data-iso')).toBe(createdAt.toISOString())
  })
})
