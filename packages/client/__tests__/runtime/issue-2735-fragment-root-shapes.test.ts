/**
 * #2735, second round. The fix that connects every root of a multi-root
 * fragment has to agree with what a fragment's top level can actually
 * hold, and the compiler emits four shapes beyond "two adjacent
 * elements" — each verified here against the real `createComponent()`
 * CSR-mount path rather than a re-implementation of it.
 *
 * The corpus fixture (`multi-root-fragment`) covers the element+text
 * shape end to end through the browser oracle; these cases cover the
 * ones a single fixture cannot hold at once, including the two that used
 * to throw or drop silently:
 *
 *  - a leading Text node made `parseHTML(...).firstChild` a non-Element,
 *    and step 7b's unconditional `element.hasAttribute(BF_PLACEHOLDER)`
 *    threw `element.hasAttribute is not a function`;
 *  - a `<!--bf:sN-->` marker between two element roots was dropped by an
 *    element-only walk, leaving the runtime's slot lookup unbindable;
 *  - a fragment with no element root at all has nothing to carry a
 *    scope, and must refuse loudly rather than crash.
 */
import { test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

async function mount(id: string, template: string): Promise<string> {
  const { hydrate, createComponent } = await import('../../src/runtime/index.ts')
  hydrate(id, { init: () => {}, template: () => template, comment: true, fragmentRoot: true } as never)
  const host = document.createElement('div')
  host.append(createComponent(id, {}) as Node)
  return host.innerHTML
}

/** Boundary comments wrap the roots; compare only what sits between them. */
function inner(html: string): string {
  return html.replace(/^<!--bf-scope:[^>]*-->/, '').replace(/<!--bf-\/scope:[^>]*-->$/, '')
}

test('two element roots both reach the DOM', async () => {
  const tpl = '<h1>t</h1><p bf="s1">0</p>'
  expect(inner(await mount('MrfA', tpl))).toBe(tpl)
})

test('bare text between two element roots survives', async () => {
  const tpl = '<h1>t</h1> mid <p bf="s1">0</p>'
  expect(inner(await mount('MrfB', tpl))).toBe(tpl)
})

test('a leading text root does not throw and is kept', async () => {
  const tpl = 'lead <p bf="s1">0</p>'
  expect(inner(await mount('MrfC', tpl))).toBe(tpl)
})

test('a slot marker between element roots survives', async () => {
  const tpl = '<h1>t</h1><!--bf:s9--><p bf="s1">0</p>'
  expect(inner(await mount('MrfD', tpl))).toBe(tpl)
})

test('a fragment with no element root is refused, not crashed', async () => {
  const html = await mount('MrfE', 'just text')
  expect(html).toContain('MrfE_placeholder')
})
