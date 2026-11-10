import { $, __bfSlot, createComponent, createDisposableEffect, createSignal, escapeAttr, escapeCommentText, escapeText, escapeTextOrNode, hydrate, insert, lazySlots, mapArrayAnchored, qsa } from '@barefootjs/client/runtime'


export function initLoopItemCondAttrs(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [shown] = createSignal(true)
  const [busy, setBusy] = createSignal(false)
  const [items] = createSignal([{ id: 1 }, { id: 2 }])

  const [_s1, _s0, _s5] = $(__scope, 's1', 's0', 's5')

  insert(__scope, 's0', () => busy(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('busy', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('idle', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s1) _s1.addEventListener('click', () => setBusy(!busy()))
  mapArrayAnchored(() => items(), _s5, (item) => String(item.id), (item, __idx, __existing) => {
    const __anchor = __existing ?? document.createComment(`bf-loop-i:${item().id}`)
    let __frag = null
    if (!__existing) {
      __frag = document.createDocumentFragment()
      __frag.appendChild(__anchor)
      __frag.appendChild(document.createComment('bf-cond-start:s2'))
      __frag.appendChild(document.createComment('bf-cond-end:s2'))
    }
    insert(__anchor, 's2', () => shown(), {
      template: () => { const __slots = []; return { html: `<em bf-c="s2" data-key="${escapeAttr(item().id)}" ${(`${busy() ? 'row on' : 'row off'}`) != null ? 'class="' + escapeAttr(`${busy() ? 'row on' : 'row off'}`) + '"' : ''} ${(`${busy() ? 'yes' : 'no'}`) != null ? 'data-x="' + escapeAttr(`${busy() ? 'yes' : 'no'}`) + '"' : ''} ${busy() ? 'hidden' : ''} bf="s4"><!--bf:s3-->${__bfSlot(item().id, __slots)}<!--/--></em>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        { const __ra_s4 = qsa(__branchScope, '[bf="s4"]')
        const __l = []
        if (__ra_s4) {
          __disposers.push(createDisposableEffect(() => {
            { const __x = `${busy() ? 'row on' : 'row off'}`
            if (!(0 in __l) || !Object.is(__l[0], __x)) {
              { const __v = __x; if (__v != null) __ra_s4.setAttribute('class', String(__v)); else __ra_s4.removeAttribute('class') }
            }
            __l[0] = __x }
          }))
          __disposers.push(createDisposableEffect(() => {
            { const __x = `${busy() ? 'yes' : 'no'}`
            if (!(1 in __l) || !Object.is(__l[1], __x)) {
              { const __v = __x; if (__v != null) __ra_s4.setAttribute('data-x', String(__v)); else __ra_s4.removeAttribute('data-x') }
            }
            __l[1] = __x }
          }))
          __disposers.push(createDisposableEffect(() => {
            { const __x = busy()
            if (!(2 in __l) || !Object.is(__l[2], __x)) {
              __ra_s4.hidden = !!(__x)
            }
            __l[2] = __x }
          }))
        } }
        const __bfw_s3 = lazySlots(__branchScope, [{ id: 's3', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s3('s3', escapeTextOrNode(item().id)) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s2--><!--bf-cond-end:s2-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __frag ?? __anchor
  }, 'l0')

}

hydrate('LoopItemCondAttrs', { init: initLoopItemCondAttrs, template: (_p) => `<div bf="s5"><button class="toggle" bf="s1">${(false) ? `<!--bf-cond-start:s0-->${escapeText('busy')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0-->${escapeText('idle')}<!--bf-cond-end:s0-->`}</button><!--bf-loop:l0-->${([{ id: 1 }, { id: 2 }]).map((item) => `<!--bf-loop-i:${escapeCommentText(item.id)}-->${(true) ? `<em bf-c="s2" data-key="${escapeAttr(item.id)}" ${(`${(false) ? 'row on' : 'row off'}`) != null ? 'class="' + escapeAttr(`${(false) ? 'row on' : 'row off'}`) + '"' : ''} ${(`${(false) ? 'yes' : 'no'}`) != null ? 'data-x="' + escapeAttr(`${(false) ? 'yes' : 'no'}`) + '"' : ''} ${(false) ? 'hidden' : ''} bf="s4"><!--bf:s3-->${escapeText(item.id)}<!--/--></em>` : `<!--bf-cond-start:s2--><!--bf-cond-end:s2-->`}`).join('')}<!--bf-/loop:l0--></div>` })
export function LoopItemCondAttrs(_p, __bfKey) { return createComponent('LoopItemCondAttrs', _p, __bfKey) }
