/**
 * #3955 — the compiler now spells a child's CSR placeholder as
 * `<template data-bf-ph="…">` (a `<div>` was moved by the HTML parser out of
 * a `<p>`). The runtime finds a placeholder by its attribute and replaces it
 * with `replaceWith`, whatever its tag, so the change needs nothing here;
 * this pins that a `<template>` placeholder is found and replaced in place,
 * at a nested position and as the parent's root. Output compiled before the
 * change keeps its `<div>` placeholders and is resolved the same way.
 * (`<template>` in table contexts is not checked here:
 * happy-dom foster-parents it, unlike browsers; the real-browser
 * fixture-hydrate suite pins those parents.)
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('a <template> child placeholder mounts in place', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('under a <p>, also through a <span>', async () => {
    const { hydrate, createComponent, upsertChild } = await import('../../src/runtime')

    hydrate('TplPhKid', {
      init: () => {},
      template: (p: { v: string }) => `<b class="kid">${p.v}</b>`,
    })
    hydrate('TplPhHost', {
      init: (el: Element) => {
        upsertChild(el, 'TplPhKid', 's0', { v: 'x' })
        upsertChild(el, 'TplPhKid', 's1', { v: 'y' })
      },
      template: () =>
        `<div><p class="para"><template data-bf-ph="s0"></template></p>` +
        `<p class="nested"><span><template data-bf-ph="s1"></template></span></p></div>`,
    })

    const host = createComponent('TplPhHost', {})
    document.body.append(host)

    expect(host.querySelector('.para > .kid')?.textContent).toBe('x')
    expect(host.querySelector('.nested > span > .kid')?.textContent).toBe('y')
    expect(host.querySelectorAll('[data-bf-ph]').length).toBe(0)
  })

  test('as the root of a parent whose whole render is the deferred child', async () => {
    const { hydrate, createComponent, upsertChild } = await import('../../src/runtime')

    hydrate('TplPhRootKid', {
      init: () => {},
      template: () => `<i class="root-kid">k</i>`,
    })
    hydrate('TplPhRootHost', {
      init: (el: Element) => {
        upsertChild(el, 'TplPhRootKid', 's0', {})
      },
      template: () => `<template data-bf-ph="s0"></template>`,
      comment: true,
    })

    const mounted = createComponent('TplPhRootHost', {})
    expect(mounted.tagName).toBe('I')
    expect(mounted.className).toBe('root-kid')
  })
})
