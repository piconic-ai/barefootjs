import { $, __bfSlot, createComponent, createDisposableEffect, createSignal, escapeAttr, escapeText, hydrate, insert, ownScopeId, qsa } from '@barefootjs/client/runtime'


export function initFragmentRootCondAttrs(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)

  const [shown] = createSignal(true)
  const [late, setLate] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  const [_s1, _s4, _s0, _s2, _s5] = $(__scope, 's1', 's4', 's0', 's2', 's5')

  insert(__scope, 's0', () => busy(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('busy', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('idle', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's2', () => shown(), {
    template: () => { const __slots = []; return { html: `<button bf-c="s2" ${(`${busy() ? 'action on' : 'action off'}`) != null ? 'class="' + escapeAttr(`${busy() ? 'action on' : 'action off'}`) + '"' : ''} ${(`${busy() ? 'yes' : 'no'}`) != null ? 'data-x="' + escapeAttr(`${busy() ? 'yes' : 'no'}`) + '"' : ''} ${busy() ? 'disabled' : ''} ${busy() ? 'hidden' : ''} bf="s3">action</button>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      { const __ra_s3 = qsa(__branchScope, '[bf="s3"]')
      const __l = []
      if (__ra_s3) {
        __disposers.push(createDisposableEffect(() => {
          { const __x = `${busy() ? 'action on' : 'action off'}`
          if (!(0 in __l) || !Object.is(__l[0], __x)) {
            { const __v = __x; if (__v != null) __ra_s3.setAttribute('class', String(__v)); else __ra_s3.removeAttribute('class') }
          }
          __l[0] = __x }
        }))
        __disposers.push(createDisposableEffect(() => {
          { const __x = `${busy() ? 'yes' : 'no'}`
          if (!(1 in __l) || !Object.is(__l[1], __x)) {
            { const __v = __x; if (__v != null) __ra_s3.setAttribute('data-x', String(__v)); else __ra_s3.removeAttribute('data-x') }
          }
          __l[1] = __x }
        }))
        __disposers.push(createDisposableEffect(() => {
          { const __x = busy()
          if (!(2 in __l) || !Object.is(__l[2], __x)) {
            __ra_s3.disabled = !!(__x)
          }
          __l[2] = __x }
        }))
        __disposers.push(createDisposableEffect(() => {
          { const __x = busy()
          if (!(3 in __l) || !Object.is(__l[3], __x)) {
            __ra_s3.hidden = !!(__x)
          }
          __l[3] = __x }
        }))
      } }
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s2--><!--bf-cond-end:s2-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's5', () => late(), {
    template: () => { const __slots = []; return { html: `<span bf-c="s5" ${(`${busy() ? 'late on' : 'late off'}`) != null ? 'class="' + escapeAttr(`${busy() ? 'late on' : 'late off'}`) + '"' : ''} ${(`${busy() ? 'yes' : 'no'}`) != null ? 'data-x="' + escapeAttr(`${busy() ? 'yes' : 'no'}`) + '"' : ''} ${busy() ? 'hidden' : ''} bf="s6">late</span>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      { const __ra_s6 = qsa(__branchScope, '[bf="s6"]')
      const __l = []
      if (__ra_s6) {
        __disposers.push(createDisposableEffect(() => {
          { const __x = `${busy() ? 'late on' : 'late off'}`
          if (!(0 in __l) || !Object.is(__l[0], __x)) {
            { const __v = __x; if (__v != null) __ra_s6.setAttribute('class', String(__v)); else __ra_s6.removeAttribute('class') }
          }
          __l[0] = __x }
        }))
        __disposers.push(createDisposableEffect(() => {
          { const __x = `${busy() ? 'yes' : 'no'}`
          if (!(1 in __l) || !Object.is(__l[1], __x)) {
            { const __v = __x; if (__v != null) __ra_s6.setAttribute('data-x', String(__v)); else __ra_s6.removeAttribute('data-x') }
          }
          __l[1] = __x }
        }))
        __disposers.push(createDisposableEffect(() => {
          { const __x = busy()
          if (!(2 in __l) || !Object.is(__l[2], __x)) {
            __ra_s6.hidden = !!(__x)
          }
          __l[2] = __x }
        }))
      } }
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s5--><!--bf-cond-end:s5-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s1) _s1.addEventListener('click', () => setBusy(!busy()))
  if (_s4) _s4.addEventListener('click', () => setLate(!late()))
}

hydrate('FragmentRootCondAttrs', { init: initFragmentRootCondAttrs, template: (_p) => `<button class="toggle" bf="s1">${(false) ? `<!--bf-cond-start:s0-->${escapeText('busy')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0-->${escapeText('idle')}<!--bf-cond-end:s0-->`}</button>${(true) ? `<button bf-c="s2" ${(`${(false) ? 'action on' : 'action off'}`) != null ? 'class="' + escapeAttr(`${(false) ? 'action on' : 'action off'}`) + '"' : ''} ${(`${(false) ? 'yes' : 'no'}`) != null ? 'data-x="' + escapeAttr(`${(false) ? 'yes' : 'no'}`) + '"' : ''} ${(false) ? 'disabled' : ''} ${(false) ? 'hidden' : ''} bf="s3">action</button>` : `<!--bf-cond-start:s2--><!--bf-cond-end:s2-->`}<button class="enter" bf="s4">enter</button>${(false) ? `<span bf-c="s5" ${(`${(false) ? 'late on' : 'late off'}`) != null ? 'class="' + escapeAttr(`${(false) ? 'late on' : 'late off'}`) + '"' : ''} ${(`${(false) ? 'yes' : 'no'}`) != null ? 'data-x="' + escapeAttr(`${(false) ? 'yes' : 'no'}`) + '"' : ''} ${(false) ? 'hidden' : ''} bf="s6">late</span>` : `<!--bf-cond-start:s5--><!--bf-cond-end:s5-->`}`, comment: true, fragmentRoot: true })
export function FragmentRootCondAttrs(_p, __bfKey) { return createComponent('FragmentRootCondAttrs', _p, __bfKey) }
