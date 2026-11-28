/**
 * #4058: a loop row's conditional must never be drawn into a nested child
 * component's conditional when both share a slot id.
 *
 * Slot ids are counted per component file, so a child rendered inside a
 * parent's loop row can carry a conditional with the same id as the row's
 * own. `insert()`'s lookups for the conditional's DOM anchors (the
 * `bf-c="sN"` element and the `<!--bf-cond-start:sN-->` marker) used to walk
 * into the child's subtree, so the row's branch was written between the
 * child's markers (or onto the child's element).
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { insert, findCondContainer } from '../../src/runtime/insert'
import { createSignal } from '../../src/reactive'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

const noop = () => {}
const img = '<img bf-c="s5" data-cover="" src="a.png" alt="">'
const markers = '<!--bf-cond-start:s5--><!--bf-cond-end:s5-->'

const branch = (html: string) => ({ template: () => html, bindEvents: noop })

function childOf(row: Element): Element {
  return row.querySelector('[bf-s="Child_abc"]')!
}

describe('insert(): loop row conditional vs. nested child conditional with the same slot id (#4058)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('first run: the row\'s own element conditional is not drawn into the child\'s markers', () => {
    document.body.innerHTML =
      '<ul><li id="row">' +
      `<span class="cover">${img}</span>` +
      `<p bf-s="Child_abc" class="meta">author${markers}</p>` +
      '</li></ul>'
    const row = document.getElementById('row')!

    insert(row, 's5', () => true, branch(img), branch(markers))

    expect(childOf(row).innerHTML).toBe(`author${markers}`)
    expect(row.querySelectorAll('img').length).toBe(1)
    expect(row.querySelector('.cover > img[bf-c="s5"]')).not.toBeNull()
  })

  test('true -> false swap replaces the row\'s own element, not the child\'s range', () => {
    document.body.innerHTML =
      '<ul><li id="row">' +
      `<span class="cover">${img}</span>` +
      `<p bf-s="Child_abc" class="meta">author${markers}</p>` +
      '</li></ul>'
    const row = document.getElementById('row')!
    const [cover, setCover] = createSignal(true)

    insert(row, 's5', () => cover(), branch(img), branch(markers))
    setCover(false)

    expect(childOf(row).innerHTML).toBe(`author${markers}`)
    expect(row.querySelector('.cover')!.innerHTML).toBe(markers)
    expect(row.querySelectorAll('img').length).toBe(0)

    // And back: the row's own markers (not the child's) receive the branch.
    setCover(true)
    expect(childOf(row).innerHTML).toBe(`author${markers}`)
    expect(row.querySelector('.cover > img[bf-c="s5"]')).not.toBeNull()
    expect(row.querySelectorAll('img').length).toBe(1)
  })

  test('both fragment markers, child first in DOM: the row\'s own markers are used', () => {
    document.body.innerHTML =
      '<ul><li id="row">' +
      `<p bf-s="Child_abc" class="meta">author${markers}</p>` +
      `<span class="cover">${markers}</span>` +
      '</li></ul>'
    const row = document.getElementById('row')!
    const [cover, setCover] = createSignal(false)

    insert(row, 's5', () => cover(), branch(`<!--bf-cond-start:s5-->${img}<!--bf-cond-end:s5-->`), branch(markers))
    setCover(true)

    expect(childOf(row).innerHTML).toBe(`author${markers}`)
    expect(row.querySelector('.cover > img[bf-c="s5"]')).not.toBeNull()
    expect(findCondContainer(row, 's5')).toBe(row.querySelector('.cover')!)
  })

  test('both element conditionals, child first in DOM: the swap replaces the row\'s own element', () => {
    document.body.innerHTML =
      '<ul><li id="row">' +
      '<p bf-s="Child_abc" class="meta"><span bf-c="s5">following</span></p>' +
      '<span class="cover"><b bf-c="s5">yes</b></span>' +
      '</li></ul>'
    const row = document.getElementById('row')!
    const [on, setOn] = createSignal(true)

    insert(row, 's5', () => on(), branch('<b bf-c="s5">yes</b>'), branch('<i bf-c="s5">no</i>'))
    setOn(false)

    expect(childOf(row).innerHTML).toBe('<span bf-c="s5">following</span>')
    expect(row.querySelector('.cover')!.innerHTML).toBe('<i bf-c="s5">no</i>')
  })

  test('markers nested in plain elements of the scope, and nested conditionals, are still found', () => {
    document.body.innerHTML =
      '<div bf-s="Parent_1"><section><div>' +
      '<!--bf-cond-start:s1--><!--bf-cond-start:s2--><!--bf-cond-end:s2--><!--bf-cond-end:s1-->' +
      '</div></section></div>'
    const scope = document.querySelector('[bf-s="Parent_1"]')!
    const [outer, setOuter] = createSignal(false)

    insert(scope, 's1', () => outer(), branch('<!--bf-cond-start:s1--><em>on</em><!--bf-cond-end:s1-->'), branch('<!--bf-cond-start:s1--><!--bf-cond-start:s2--><!--bf-cond-end:s2--><!--bf-cond-end:s1-->'))
    setOuter(true)
    expect(scope.querySelector('section > div')!.innerHTML).toBe('<!--bf-cond-start:s1--><em>on</em><!--bf-cond-end:s1-->')
  })

  test('a child component that is itself the branch content is swapped as the conditional element', () => {
    document.body.innerHTML =
      '<ul><li id="row"><div bf-s="Child_abc" bf-c="s5"><span bf-c="s5">inner</span></div></li></ul>'
    const row = document.getElementById('row')!
    const [on, setOn] = createSignal(true)

    insert(row, 's5', () => on(), branch('<div bf-s="Child_abc" bf-c="s5"><span bf-c="s5">inner</span></div>'), branch(markers))
    setOn(false)

    expect(row.innerHTML).toBe(markers)
  })

  test('a parent-owned (^) conditional rendered inside a child\'s children is still found', () => {
    document.body.innerHTML =
      '<section bf-s="P_1"><div bf-s="P_1_s2" class="w"><!--bf-cond-start:^s1--><!--bf-cond-end:^s1--></div></section>'
    const scope = document.querySelector('[bf-s="P_1"]')!
    const [show, setShow] = createSignal(false)

    insert(scope, '^s1', () => show(), branch('<a bf-c="^s1">x</a>'), branch('<!--bf-cond-start:^s1--><!--bf-cond-end:^s1-->'))
    setShow(true)
    expect(scope.querySelector('.w')!.innerHTML).toBe('<!--bf-cond-start:^s1--><a bf-c="^s1">x</a><!--bf-cond-end:^s1-->')
    setShow(false)
    expect(scope.querySelector('.w')!.innerHTML).toBe('<!--bf-cond-start:^s1--><!--bf-cond-end:^s1-->')
  })

  test('a fragment-root child (comment scope) inside the row is skipped too', () => {
    document.body.innerHTML =
      '<ul><li id="row">' +
      `<!--bf-scope:Frag_abc--><p>author${markers}</p><!--bf-/scope:Frag_abc-->` +
      `<span class="cover">${markers}</span>` +
      '</li></ul>'
    const row = document.getElementById('row')!
    const [cover, setCover] = createSignal(false)

    insert(row, 's5', () => cover(), branch(`<!--bf-cond-start:s5-->${img}<!--bf-cond-end:s5-->`), branch(markers))
    setCover(true)

    expect(row.querySelector('p')!.innerHTML).toBe(`author${markers}`)
    expect(row.querySelector('.cover > img[bf-c="s5"]')).not.toBeNull()
  })

  // --- PR review follow-ups ---

  test('legacy markup: an unclosed fragment child range does not hide the parent\'s later conditional', () => {
    // Older SSR output has no `<!--bf-/scope:…-->` end marker, so where the
    // child's range ends is ambiguous; the parent's markers must still be found.
    document.body.innerHTML =
      `<div bf-s="Parent_1"><!--bf-scope:Child_1--><p>child</p>${markers}</div>`
    const scope = document.querySelector('[bf-s="Parent_1"]')!
    const [on, setOn] = createSignal(false)

    insert(scope, 's5', () => on(), branch(`<!--bf-cond-start:s5-->${img}<!--bf-cond-end:s5-->`), branch(markers))
    setOn(true)

    expect(scope.innerHTML).toBe(`<!--bf-scope:Child_1--><p>child</p><!--bf-cond-start:s5-->${img}<!--bf-cond-end:s5-->`)
  })

  test('a self-owner portaled child is not searched as the parent\'s relocated content', () => {
    document.body.innerHTML =
      '<div bf-s="Parent_1"><b bf-c="s5">on</b></div>' +
      `<div bf-s="Child_1" bf-h="Parent_1" bf-po="Child_1">${markers}</div>`
    const scope = document.querySelector('[bf-s="Parent_1"]')!
    const child = document.querySelector('[bf-s="Child_1"]')!
    const [on, setOn] = createSignal(true)

    insert(scope, 's5', () => on(), branch('<!--bf-cond-start:s5--><b bf-c="s5">on</b><!--bf-cond-end:s5-->'), branch(markers))
    setOn(false)

    expect(child.innerHTML).toBe(markers)
    expect(scope.innerHTML).toBe(markers)
  })

  test('an explicit portal wrapper (no bf-s) owned by the scope is still searched', () => {
    document.body.innerHTML =
      '<div bf-s="Parent_1"></div>' +
      `<div bf-pi="bf-portal-1" bf-po="Parent_1">${markers}</div>`
    const scope = document.querySelector('[bf-s="Parent_1"]')!
    const portal = document.querySelector('[bf-pi]')!
    const [on, setOn] = createSignal(false)

    insert(scope, 's5', () => on(), branch(`<!--bf-cond-start:s5-->${img}<!--bf-cond-end:s5-->`), branch(markers))
    setOn(true)

    expect(portal.innerHTML).toBe(`<!--bf-cond-start:s5-->${img}<!--bf-cond-end:s5-->`)
  })

  test('a forwarded (^) conditional inside a self-owner portaled child is still found', () => {
    document.body.innerHTML =
      '<div bf-s="Parent_1"></div>' +
      '<div bf-s="Child_1" bf-h="Parent_1" bf-po="Child_1"><!--bf-cond-start:^s5--><!--bf-cond-end:^s5--></div>'
    const scope = document.querySelector('[bf-s="Parent_1"]')!
    const child = document.querySelector('[bf-s="Child_1"]')!
    const [on, setOn] = createSignal(false)

    insert(scope, '^s5', () => on(), branch('<!--bf-cond-start:^s5--><em>x</em><!--bf-cond-end:^s5-->'), branch('<!--bf-cond-start:^s5--><!--bf-cond-end:^s5-->'))
    setOn(true)

    expect(child.innerHTML).toBe('<!--bf-cond-start:^s5--><em>x</em><!--bf-cond-end:^s5-->')
  })

  test('the end marker is paired with the start, skipping a nested fragment child\'s same-id range', () => {
    const inner = '<!--bf-scope:Child_1--><!--bf-cond-start:s5--><i>child</i><!--bf-cond-end:s5--><!--bf-/scope:Child_1-->'
    document.body.innerHTML =
      `<div bf-s="Parent_1"><!--bf-cond-start:s5-->${inner}<span>suffix</span><!--bf-cond-end:s5--></div>`
    const scope = document.querySelector('[bf-s="Parent_1"]')!
    const [on, setOn] = createSignal(true)

    insert(scope, 's5', () => on(), branch(`<!--bf-cond-start:s5-->${inner}<span>suffix</span><!--bf-cond-end:s5-->`), branch(markers))
    setOn(false)

    expect(scope.innerHTML).toBe(markers)
  })
})
