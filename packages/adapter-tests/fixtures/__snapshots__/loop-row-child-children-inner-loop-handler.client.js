import { createComponent, hydrate, markupOrEmpty, $, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, initChild, lazySlots, mapArray, qsa, qsaChildScopes, renderChild } from '@barefootjs/client/runtime'

function initChip() {}

hydrate('Chip__0da3ade1', { init: initChip, template: (_p) => `<span class="chip">${markupOrEmpty(_p.children)}</span>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__0da3ade1', _p, __bfKey) }
export function initLoopRowChildChildrenInnerLoopHandler(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const ROWS = [
  { id: 'a', tags: ['x', 'y'] },
  { id: 'b', tags: ['z'] },
]
  const [rows, setRows] = createSignal([
    { id: 'a', tags: ['x', 'y'] },
    { id: 'b', tags: ['z'] },
  ])
  const [picked, setPicked] = createSignal('none')

  const [_s2, _s7, _s12] = $(__scope, 's2', 's7', 's12')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s2) _s2.addEventListener('click', () => setRows([{ id: 'c', tags: ['p', 'q'] }, ...rows()]))
  mapArray(() => rows(), _s12, (o, i) => String(o.id), (o, i, __existing) => {
    if (__existing) {
      initChild('Chip__0da3ade1', __existing, { get children() { return `<ul bf="^s10"><!--bf-loop:l2-->${o().tags.map((tag, j) => `<li data-key-1="${escapeAttr(tag)}"><button type="button" class="pick" bf="^s9"><!--bf:^s8-->${escapeText(tag)}<!--/--></button></li>`).join('')}<!--bf-/loop:l2--></ul>` } })
      // Reactive inner loop: o.tags
      { const __ic1_0 = qsa(__existing, '[bf="^s10"]')
      if (__ic1_0) mapArray(() => o().tags || [], __ic1_0, (tag, j) => String(tag), (tag, __innerIdx1_0, __existing) => {
        const j = __innerIdx1_0
        let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-1="${escapeAttr(tag())}"><button type="button" class="pick" bf="^s9"><!--bf:^s8-->${escapeText(tag())}<!--/--></button></li>`; return __t.content.firstElementChild.cloneNode(true) })()
        __innerEl1_0.setAttribute('data-key-1', String(tag()))
        { const __e = qsa(__innerEl1_0, '[bf="^s9"]'); if (__e) __e.addEventListener('click', () => setPicked(`${o().id}-${tag()}@${i()}.${j()}`)) }
        const __bfw_s8 = lazySlots(__innerEl1_0, [{ id: '^s8', kind: 'text', path: [] }])
        createEffect(() => { __bfw_s8('^s8', String(tag())) })
        return __innerEl1_0
      }, 'l2', undefined, "data-key-1") }
      return __existing
    }
    const __csrEl = createComponent('Chip__0da3ade1', { get children() { return `<ul bf="^s10"><!--bf-loop:l2-->${o().tags.map((tag, j) => `<li data-key-1="${escapeAttr(tag)}"><button type="button" class="pick" bf="^s9"><!--bf:^s8-->${escapeText(tag)}<!--/--></button></li>`).join('')}<!--bf-/loop:l2--></ul>` } }, o().id)
    // Reactive inner loop: o.tags
    { const __ic1_0 = qsa(__csrEl, '[bf="^s10"]')
    if (__ic1_0) mapArray(() => o().tags || [], __ic1_0, (tag, j) => String(tag), (tag, __innerIdx1_0, __existing) => {
      const j = __innerIdx1_0
      let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-1="${escapeAttr(tag())}"><button type="button" class="pick" bf="^s9"><!--bf:^s8-->${escapeText(tag())}<!--/--></button></li>`; return __t.content.firstElementChild.cloneNode(true) })()
      __innerEl1_0.setAttribute('data-key-1', String(tag()))
      { const __e = qsa(__innerEl1_0, '[bf="^s9"]'); if (__e) __e.addEventListener('click', () => setPicked(`${o().id}-${tag()}@${i()}.${j()}`)) }
      const __bfw_s8 = lazySlots(__innerEl1_0, [{ id: '^s8', kind: 'text', path: [] }])
      createEffect(() => { __bfw_s8('^s8', String(tag())) })
      return __innerEl1_0
    }, 'l2', undefined, "data-key-1") }
    return __csrEl
  }, 'l3')

  // Initialize static array children (hydrate skips nested instances)
  if (_s7) {
    const __childScopes = qsaChildScopes(_s7, `[bf-h="${__scopeId}"][bf-m="s6"], [bf-s$="_s6"]`)
    __childScopes.forEach((childScope, __idx) => {
      const o = ROWS[__idx]
      initChild('Chip__0da3ade1', childScope, {})
      // Reactive inner loop: o.tags
      { const __ic1_0 = qsa(childScope, '[bf="^s5"]')
      if (__ic1_0) mapArray(() => o.tags || [], __ic1_0, (tag) => String(tag), (tag, __innerIdx1_0, __existing) => {
        let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-1="${escapeAttr(tag())}"><button type="button" class="pick" bf="^s4"><!--bf:^s3-->${escapeText(tag())}<!--/--></button></li>`; return __t.content.firstElementChild.cloneNode(true) })()
        __innerEl1_0.setAttribute('data-key-1', String(tag()))
        { const __e = qsa(__innerEl1_0, '[bf="^s4"]'); if (__e) __e.addEventListener('click', () => setPicked(`${o.id}-${tag()}`)) }
        const __bfw_s3 = lazySlots(__innerEl1_0, [{ id: '^s3', kind: 'text', path: [] }])
        createEffect(() => { __bfw_s3('^s3', String(tag())) })
        return __innerEl1_0
      }, 'l0', undefined, "data-key-1") }
    })
  }

}

hydrate('LoopRowChildChildrenInnerLoopHandler', { init: initLoopRowChildChildrenInnerLoopHandler, template: (_p) => `<div><p class="picked" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><button type="button" class="add" bf="s2">add</button><div class="rows" bf="s7"><!--bf-loop:l1-->${([
  { id: 'a', tags: ['x', 'y'] },
  { id: 'b', tags: ['z'] },
]).map((o) => `${renderChild('Chip__0da3ade1', {children: `<ul bf="^s5"><!--bf-loop:l0-->${o.tags.map((tag) => `<li data-key-1="${escapeAttr(tag)}"><button type="button" class="pick" bf="^s4"><!--bf:^s3-->${escapeText(tag)}<!--/--></button></li>`).join('')}<!--bf-/loop:l0--></ul>`}, o.id, 's6', true)}`).join('')}<!--bf-/loop:l1--></div><div class="live" bf="s12"><!--bf-loop:l3-->${([
    { id: 'a', tags: ['x', 'y'] },
    { id: 'b', tags: ['z'] },
  ]).map((o, i) => `${renderChild('Chip__0da3ade1', {children: `<ul bf="^s10"><!--bf-loop:l2-->${o.tags.map((tag, j) => `<li data-key-1="${escapeAttr(tag)}"><button type="button" class="pick" bf="^s9"><!--bf:^s8-->${escapeText(tag)}<!--/--></button></li>`).join('')}<!--bf-/loop:l2--></ul>`}, o.id, 's11', true)}`).join('')}<!--bf-/loop:l3--></div></div>` })
export function LoopRowChildChildrenInnerLoopHandler(_p, __bfKey) { return createComponent('LoopRowChildChildrenInnerLoopHandler', _p, __bfKey) }
