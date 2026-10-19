/**
 * One ownership rule for slot markers (#3134): `$t` and `claimSlots` both ask
 * `isOwnedByScope`, so a dual-purpose comment-scope root (registered as an
 * ancestor's comment-scope proxy while carrying its own `bf-s`) resolves its
 * OWN marker, never a same-numbered one inside a further-nested child.
 *
 * `$t` used to accept any marker inside the ancestor's registered comment
 * range, so it could write a child's update into a nested child's text node.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

const { $t } = await import('../../src/runtime/query.ts')
const { claimSlots } = await import('../../src/runtime/claim-slots.ts')
const { commentScopeRegistry, isOwnedByScope } = await import('../../src/runtime/scope.ts')

/** A comment-scoped ancestor whose registered proxy is `root`, carrying its own `bf-s`. */
function mountDualPurposeRoot(rootHtml: string, siblingHtml = ''): { root: Element; sibling: Element | null; page: Element } {
  const page = document.createElement('div')
  page.setAttribute('bf-s', 'App_root')
  const container = document.createElement('div')
  page.appendChild(container)
  const anchor = document.createComment('bf-scope:Outer_abc')
  const endAnchor = document.createComment('bf-/scope:Outer_abc')
  container.appendChild(anchor)
  const root = document.createElement('div')
  root.setAttribute('bf-s', 'Outer_abc_s0')
  root.innerHTML = rootHtml
  container.appendChild(root)
  let sibling: Element | null = null
  if (siblingHtml) {
    sibling = document.createElement('span')
    sibling.innerHTML = siblingHtml
    container.appendChild(sibling)
  }
  container.appendChild(endAnchor)
  // A marker after the range: never the ancestor's.
  const after = document.createElement('i')
  after.innerHTML = '<!--bf:s2-->outside<!--/-->'
  container.appendChild(after)
  commentScopeRegistry.set(root, { commentNode: anchor, scopeId: 'Outer_abc' })
  return { root, sibling, page }
}

const NESTED_THEN_OWN = '<section bf-s="Badge_x1"><!--bf:s0-->nested<!--/--></section><!--bf:s0-->own<!--/-->'

describe('slot marker ownership on a dual-purpose comment-scope root (#3134)', () => {
  test('$t resolves the root’s own marker, not the nested child’s', () => {
    const { root } = mountDualPurposeRoot(NESTED_THEN_OWN)
    const [text] = $t(root, 's0')
    expect(text?.nodeValue).toBe('own')
  })

  test('$t and claimSlots write to the same marker', () => {
    const viaT = mountDualPurposeRoot(NESTED_THEN_OWN).root
    const [text] = $t(viaT, 's0')
    text!.nodeValue = 'patched'

    const viaClaim = mountDualPurposeRoot(NESTED_THEN_OWN).root
    claimSlots(viaClaim, [{ id: 's0', kind: 'text', path: [] }]).write('s0', 'patched')

    expect(viaT.innerHTML).toBe(viaClaim.innerHTML)
    expect(viaT.innerHTML).toContain('<!--bf:s0-->nested<!--/-->')
  })

  test('$t resolves an ancestor-owned marker in a later sibling of the root, past an outer bf-s', () => {
    const { root } = mountDualPurposeRoot('<b>first</b>', '<!--bf:s1-->hi<!--/-->')
    const [text] = $t(root, 's1')
    expect(text?.nodeValue).toBe('hi')
  })

  test('$t never claims a marker outside the root and its comment range', () => {
    const { root } = mountDualPurposeRoot('<b>first</b>')
    const [text] = $t(root, 's2')
    expect(text).toBeNull()
  })
})

describe('isOwnedByScope', () => {
  test('a marker inside a nested bf-s is not owned; one directly in the root is', () => {
    const { root } = mountDualPurposeRoot(NESTED_THEN_OWN)
    const [nested, own] = [...root.childNodes].flatMap(n =>
      n.nodeType === Node.COMMENT_NODE ? [n] : [...n.childNodes].filter(c => c.nodeType === Node.COMMENT_NODE),
    ).filter(c => c.nodeValue === 'bf:s0')
    expect(isOwnedByScope(nested, root)).toBe(false)
    expect(isOwnedByScope(own, root)).toBe(true)
  })

  test('a node outside an element root with no comment scope is not owned', () => {
    const root = document.createElement('div')
    const elsewhere = document.createComment('bf:s0')
    document.createElement('p').appendChild(elsewhere)
    expect(isOwnedByScope(elsewhere, root)).toBe(false)
  })
})
