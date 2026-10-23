import { createComponent, hydrate, markupOrEmpty, $, createSignal, escapeAttr, escapeText, initChild, mapArray, renderChild } from '@barefootjs/client/runtime'

function initChip() {}

hydrate('Chip__0b5df1e5', { init: initChip, template: (_p) => `<span class="chip">${markupOrEmpty(_p.children)}</span>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__0b5df1e5', _p, __bfKey) }
export function initLoopRowChildChildrenInnerLoopShadow(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal([
    { id: 'a', tags: ['x', 'y'] },
    { id: 'b', tags: ['z'] },
  ])

  const [_s0, _s5, _s9, _s14] = $(__scope, 's0', 's5', 's9', 's14')

  if (_s0) _s0.addEventListener('click', () => setRows([{ id: 'c', tags: ['p', 'q'] }, ...rows()]))
  mapArray(() => rows(), _s5, (o, i) => String(o.id), (o, i, __existing) => {
    if (__existing) { initChild('Chip__0b5df1e5', __existing, { get children() { return `<ul bf="^s3"><!--bf-loop:l0-->${o().tags.map((tag, i) => `<li data-key-1="${escapeAttr(tag)}"><!--bf:^s1-->${escapeText(tag)}<!--/-->-<!--bf:^s2-->${escapeText(i)}<!--/--></li>`).join('')}<!--bf-/loop:l0--></ul>` } }); return __existing }
    return createComponent('Chip__0b5df1e5', { get children() { return `<ul bf="^s3"><!--bf-loop:l0-->${o().tags.map((tag, i) => `<li data-key-1="${escapeAttr(tag)}"><!--bf:^s1-->${escapeText(tag)}<!--/-->-<!--bf:^s2-->${escapeText(i)}<!--/--></li>`).join('')}<!--bf-/loop:l0--></ul>` } }, o().id)
  }, 'l1')

  mapArray(() => rows(), _s9, (o) => String(o.id), (o, __idx, __existing) => {
    if (__existing) { initChild('Chip__0b5df1e5', __existing, { get children() { return `<ul bf="^s7"><!--bf-loop:l2-->${o().tags.map((o) => `<li data-key-1="${escapeAttr(o)}"><!--bf:^s6-->${escapeText(o)}<!--/--></li>`).join('')}<!--bf-/loop:l2--></ul>` } }); return __existing }
    return createComponent('Chip__0b5df1e5', { get children() { return `<ul bf="^s7"><!--bf-loop:l2-->${o().tags.map((o) => `<li data-key-1="${escapeAttr(o)}"><!--bf:^s6-->${escapeText(o)}<!--/--></li>`).join('')}<!--bf-/loop:l2--></ul>` } }, o().id)
  }, 'l3')

  mapArray(() => rows(), _s14, ({ id, tags }, i) => String(id), (__bfItem, i, __existing) => {
    if (__existing) { initChild('Chip__0b5df1e5', __existing, { get children() { return `<ul bf="^s12"><!--bf-loop:l4-->${__bfItem().tags.map((id, i) => `<li data-key-1="${escapeAttr(id)}"><!--bf:^s10-->${escapeText(id)}<!--/-->-<!--bf:^s11-->${escapeText(i)}<!--/--></li>`).join('')}<!--bf-/loop:l4--></ul>` } }); return __existing }
    return createComponent('Chip__0b5df1e5', { get children() { return `<ul bf="^s12"><!--bf-loop:l4-->${__bfItem().tags.map((id, i) => `<li data-key-1="${escapeAttr(id)}"><!--bf:^s10-->${escapeText(id)}<!--/-->-<!--bf:^s11-->${escapeText(i)}<!--/--></li>`).join('')}<!--bf-/loop:l4--></ul>` } }, __bfItem().id)
  }, 'l5')

}

hydrate('LoopRowChildChildrenInnerLoopShadow', { init: initLoopRowChildChildrenInnerLoopShadow, template: (_p) => `<div><button type="button" class="add" bf="s0">add</button><div class="index" bf="s5"><!--bf-loop:l1-->${([
    { id: 'a', tags: ['x', 'y'] },
    { id: 'b', tags: ['z'] },
  ]).map((o, i) => `${renderChild('Chip__0b5df1e5', {children: `<ul bf="^s3"><!--bf-loop:l0-->${o.tags.map((tag, i) => `<li data-key-1="${escapeAttr(tag)}"><!--bf:^s1-->${escapeText(tag)}<!--/-->-<!--bf:^s2-->${escapeText(i)}<!--/--></li>`).join('')}<!--bf-/loop:l0--></ul>`}, o.id, 's4', true)}`).join('')}<!--bf-/loop:l1--></div><div class="item" bf="s9"><!--bf-loop:l3-->${([
    { id: 'a', tags: ['x', 'y'] },
    { id: 'b', tags: ['z'] },
  ]).map((o) => `${renderChild('Chip__0b5df1e5', {children: `<ul bf="^s7"><!--bf-loop:l2-->${o.tags.map((o) => `<li data-key-1="${escapeAttr(o)}"><!--bf:^s6-->${escapeText(o)}<!--/--></li>`).join('')}<!--bf-/loop:l2--></ul>`}, o.id, 's8', true)}`).join('')}<!--bf-/loop:l3--></div><div class="destructured" bf="s14"><!--bf-loop:l5-->${([
    { id: 'a', tags: ['x', 'y'] },
    { id: 'b', tags: ['z'] },
  ]).map(({ id, tags }, i) => `${renderChild('Chip__0b5df1e5', {children: `<ul bf="^s12"><!--bf-loop:l4-->${tags.map((id, i) => `<li data-key-1="${escapeAttr(id)}"><!--bf:^s10-->${escapeText(id)}<!--/-->-<!--bf:^s11-->${escapeText(i)}<!--/--></li>`).join('')}<!--bf-/loop:l4--></ul>`}, id, 's13', true)}`).join('')}<!--bf-/loop:l5--></div></div>` })
export function LoopRowChildChildrenInnerLoopShadow(_p, __bfKey) { return createComponent('LoopRowChildChildrenInnerLoopShadow', _p, __bfKey) }
