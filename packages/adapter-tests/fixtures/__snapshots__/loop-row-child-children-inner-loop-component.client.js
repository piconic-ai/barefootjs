import { createComponent, createSignal, hydrate, markupOrEmpty, $, createEffect, escapeTextOrMarkup, escapeTextOrNode, lazySlots, childScopesBySlot, escapeAttr, initChild, mapArray, qsa, renderChild, upsertChild } from '@barefootjs/client/runtime'

function initChip() {}

hydrate('Chip__f3568064', { init: initChip, template: (_p) => `<span class="chip">${markupOrEmpty(_p.children)}</span>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__f3568064', _p, __bfKey) }
export function initBtn(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.label
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', _p.onPick)
}

hydrate('Btn__f3568064', { init: initBtn, template: (_p) => `<button type="button" class="pick" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/--></button>`, name: 'Btn' })
export function Btn(_p, __bfKey) { return createComponent('Btn__f3568064', _p, __bfKey) }
export function initLoopRowChildChildrenInnerLoopComponent(__scope, _p = {}) {
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
  const [deep, setDeep] = createSignal([{ id: 'a', groups: [{ id: 'b', tags: ['x'] }] }])
  const [picked, setPicked] = createSignal('none')

  const [_s2, _s3, _s7, _s11, _s16] = $(__scope, 's2', 's3', 's7', 's11', 's16')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s2) _s2.addEventListener('click', () => setRows([{ id: 'c', tags: ['p', 'q'] }, ...rows()]))
  if (_s3) _s3.addEventListener('click', () => setDeep([{ id: 'c', groups: [{ id: 'd', tags: ['y'] }] }, ...deep()]))
  mapArray(() => rows(), _s11, (o, i) => String(o.id), (o, i, __existing) => {
    if (__existing) {
      initChild('Chip__f3568064', __existing, { get children() { return `<ul bf="^s9"><!--bf-loop:l2-->${o().tags.map((tag, j) => `<li data-key-1="${escapeAttr(tag)}">${renderChild('Btn__f3568064', {label: tag}, undefined, 's8')}</li>`).join('')}<!--bf-/loop:l2--></ul>` } })
      // Reactive inner loop: o.tags
      { const __ic1_0 = qsa(__existing, '[bf="^s9"]')
      if (__ic1_0) mapArray(() => o().tags || [], __ic1_0, (tag, j) => String(tag), (tag, __innerIdx1_0, __existing) => {
        const j = __innerIdx1_0
        let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-1="${escapeAttr(tag())}"><template data-bf-ph="s8"></template></li>`; return __t.content.firstElementChild.cloneNode(true) })()
        __innerEl1_0.setAttribute('data-key-1', String(tag()))
        upsertChild(__innerEl1_0, 'Btn__f3568064', 's8', { get label() { return tag() }, onPick: () => setPicked(`${o().id}-${tag()}@${i()}.${j()}`) }, undefined, __scope)
        return __innerEl1_0
      }, 'l2', undefined, "data-key-1") }
      return __existing
    }
    const __csrEl = createComponent('Chip__f3568064', { get children() { return `<ul bf="^s9"><!--bf-loop:l2-->${o().tags.map((tag, j) => `<li data-key-1="${escapeAttr(tag)}">${renderChild('Btn__f3568064', {label: tag}, undefined, 's8')}</li>`).join('')}<!--bf-/loop:l2--></ul>` } }, o().id)
    // Reactive inner loop: o.tags
    { const __ic1_0 = qsa(__csrEl, '[bf="^s9"]')
    if (__ic1_0) mapArray(() => o().tags || [], __ic1_0, (tag, j) => String(tag), (tag, __innerIdx1_0, __existing) => {
      const j = __innerIdx1_0
      let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-1="${escapeAttr(tag())}"><template data-bf-ph="s8"></template></li>`; return __t.content.firstElementChild.cloneNode(true) })()
      __innerEl1_0.setAttribute('data-key-1', String(tag()))
      upsertChild(__innerEl1_0, 'Btn__f3568064', 's8', { get label() { return tag() }, onPick: () => setPicked(`${o().id}-${tag()}@${i()}.${j()}`) }, undefined, __scope)
      return __innerEl1_0
    }, 'l2', undefined, "data-key-1") }
    return __csrEl
  }, 'l3')

  mapArray(() => deep(), _s16, (o) => String(o.id), (o, __idx, __existing) => {
    if (__existing) {
      initChild('Chip__f3568064', __existing, { get children() { return `<ul bf="^s14"><!--bf-loop:l5-->${o().groups.map((g) => `<li data-key-1="${escapeAttr(g.id)}"><ol bf="^s13"><!--bf-loop:l4-->${g.tags.map((t) => `<li data-key-2="${escapeAttr(t)}">${renderChild('Btn__f3568064', {label: t}, undefined, 's12')}</li>`).join('')}<!--bf-/loop:l4--></ol></li>`).join('')}<!--bf-/loop:l5--></ul>` } })
      // Reactive inner loop: o.groups
      { const __ic1_0 = qsa(__existing, '[bf="^s14"]')
      if (__ic1_0) mapArray(() => o().groups || [], __ic1_0, (g) => String(g.id), (g, __innerIdx1_0, __existing) => {
        let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-1="${escapeAttr(g().id)}"><ol bf="^s13"><!--bf-loop:l4-->${g().tags.map((t) => `<li data-key-2="${escapeAttr(t)}"><template data-bf-ph="s12"></template></li>`).join('')}<!--bf-/loop:l4--></ol></li>`; return __t.content.firstElementChild.cloneNode(true) })()
        __innerEl1_0.setAttribute('data-key-1', String(g().id))
        // Reactive inner loop: g.tags
        { const __ic2_0 = qsa(__innerEl1_0, '[bf="^s13"]')
        if (__ic2_0) mapArray(() => g().tags || [], __ic2_0, (t) => String(t), (t, __innerIdx2_0, __existing) => {
          let __innerEl2_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-2="${escapeAttr(t())}"><template data-bf-ph="s12"></template></li>`; return __t.content.firstElementChild.cloneNode(true) })()
          __innerEl2_0.setAttribute('data-key-2', String(t()))
          upsertChild(__innerEl2_0, 'Btn__f3568064', 's12', { get label() { return t() }, onPick: () => setPicked(`${o().id}${g().id}${t()}`) }, undefined, __scope)
          return __innerEl2_0
        }, 'l4', undefined, "data-key-2") }
        return __innerEl1_0
      }, 'l5', undefined, "data-key-1") }
      return __existing
    }
    const __csrEl = createComponent('Chip__f3568064', { get children() { return `<ul bf="^s14"><!--bf-loop:l5-->${o().groups.map((g) => `<li data-key-1="${escapeAttr(g.id)}"><ol bf="^s13"><!--bf-loop:l4-->${g.tags.map((t) => `<li data-key-2="${escapeAttr(t)}">${renderChild('Btn__f3568064', {label: t}, undefined, 's12')}</li>`).join('')}<!--bf-/loop:l4--></ol></li>`).join('')}<!--bf-/loop:l5--></ul>` } }, o().id)
    // Reactive inner loop: o.groups
    { const __ic1_0 = qsa(__csrEl, '[bf="^s14"]')
    if (__ic1_0) mapArray(() => o().groups || [], __ic1_0, (g) => String(g.id), (g, __innerIdx1_0, __existing) => {
      let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-1="${escapeAttr(g().id)}"><ol bf="^s13"><!--bf-loop:l4-->${g().tags.map((t) => `<li data-key-2="${escapeAttr(t)}"><template data-bf-ph="s12"></template></li>`).join('')}<!--bf-/loop:l4--></ol></li>`; return __t.content.firstElementChild.cloneNode(true) })()
      __innerEl1_0.setAttribute('data-key-1', String(g().id))
      // Reactive inner loop: g.tags
      { const __ic2_0 = qsa(__innerEl1_0, '[bf="^s13"]')
      if (__ic2_0) mapArray(() => g().tags || [], __ic2_0, (t) => String(t), (t, __innerIdx2_0, __existing) => {
        let __innerEl2_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-2="${escapeAttr(t())}"><template data-bf-ph="s12"></template></li>`; return __t.content.firstElementChild.cloneNode(true) })()
        __innerEl2_0.setAttribute('data-key-2', String(t()))
        upsertChild(__innerEl2_0, 'Btn__f3568064', 's12', { get label() { return t() }, onPick: () => setPicked(`${o().id}${g().id}${t()}`) }, undefined, __scope)
        return __innerEl2_0
      }, 'l4', undefined, "data-key-2") }
      return __innerEl1_0
    }, 'l5', undefined, "data-key-1") }
    return __csrEl
  }, 'l6')

  // Initialize static array children (hydrate skips nested instances)
  if (_s7) {
    const __childScopes = childScopesBySlot(_s7, __scopeId, 's6')
    __childScopes.forEach((childScope, __idx) => {
      const o = ROWS[__idx]
      initChild('Chip__f3568064', childScope, {})
    })
  }

  // Initialize component-rooted inner-loop components (depth 1)
  if (_s7) {
    const __compScopes = childScopesBySlot(_s7, __scopeId, 's4')
    let __ci = 0
    ROWS.forEach((o) => {
      o.tags.forEach((tag) => {
        const __compEl = __compScopes[__ci++]
        if (__compEl) initChild('Btn__f3568064', __compEl, { get label() { return tag }, onPick: () => setPicked(`${o.id}-${tag}`) })
      })
    })
  }

}

hydrate('LoopRowChildChildrenInnerLoopComponent', { init: initLoopRowChildChildrenInnerLoopComponent, template: (_p) => `<div><p class="picked" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><button type="button" class="add" bf="s2">add</button><button type="button" class="add-deep" bf="s3">add deep</button><div class="rows" bf="s7"><!--bf-loop:l1-->${([
  { id: 'a', tags: ['x', 'y'] },
  { id: 'b', tags: ['z'] },
]).map((o) => `${renderChild('Chip__f3568064', {children: `<ul bf="^s5"><!--bf-loop:l0-->${o.tags.map((tag) => `<li data-key-1="${escapeAttr(tag)}">${renderChild('Btn__f3568064', {label: tag}, undefined, 's4')}</li>`).join('')}<!--bf-/loop:l0--></ul>`}, o.id, 's6', true)}`).join('')}<!--bf-/loop:l1--></div><div class="live" bf="s11"><!--bf-loop:l3-->${([
    { id: 'a', tags: ['x', 'y'] },
    { id: 'b', tags: ['z'] },
  ]).map((o, i) => `${renderChild('Chip__f3568064', {children: `<ul bf="^s9"><!--bf-loop:l2-->${o.tags.map((tag, j) => `<li data-key-1="${escapeAttr(tag)}">${renderChild('Btn__f3568064', {label: tag}, undefined, 's8')}</li>`).join('')}<!--bf-/loop:l2--></ul>`}, o.id, 's10', true)}`).join('')}<!--bf-/loop:l3--></div><div class="deep" bf="s16"><!--bf-loop:l6-->${([{ id: 'a', groups: [{ id: 'b', tags: ['x'] }] }]).map((o) => `${renderChild('Chip__f3568064', {children: `<ul bf="^s14"><!--bf-loop:l5-->${o.groups.map((g) => `<li data-key-1="${escapeAttr(g.id)}"><ol bf="^s13"><!--bf-loop:l4-->${g.tags.map((t) => `<li data-key-2="${escapeAttr(t)}">${renderChild('Btn__f3568064', {label: t}, undefined, 's12')}</li>`).join('')}<!--bf-/loop:l4--></ol></li>`).join('')}<!--bf-/loop:l5--></ul>`}, o.id, 's15', true)}`).join('')}<!--bf-/loop:l6--></div></div>` })
export function LoopRowChildChildrenInnerLoopComponent(_p, __bfKey) { return createComponent('LoopRowChildChildrenInnerLoopComponent', _p, __bfKey) }
