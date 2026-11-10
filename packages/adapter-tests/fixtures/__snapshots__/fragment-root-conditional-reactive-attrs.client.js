import { $, createComponent, createEffect, createSignal, escapeAttr, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $c, __bfSlot, createDisposableEffect, escapeText, initChild, insert, ownScopeId, qsa, renderChild } from '@barefootjs/client/runtime'

export function initPresentBadge(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s4] = $(__scope, 's4')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.a
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.b
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.c
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  const __bfw_s3 = lazySlots(__scope, [{ id: 's3', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.d
    __bfw_s3('s3', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s4) {
      { const __x = _p.a
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s4.setAttribute('data-x', String(__v)); else _s4.removeAttribute('data-x') }
      }
      __l[0] = __x }
    }
  }) }

}

hydrate('PresentBadge__6482dd31', { init: initPresentBadge, template: (_p) => `<i class="badge present" ${(_p.a) != null ? 'data-x="' + escapeAttr(_p.a) + '"' : ''} bf="s4"><!--bf:s0-->${escapeTextOrMarkup(_p.a)}<!--/--><!--bf:s1-->${escapeTextOrMarkup(_p.b)}<!--/--><!--bf:s2-->${escapeTextOrMarkup(_p.c)}<!--/--><!--bf:s3-->${escapeTextOrMarkup(_p.d)}<!--/--></i>`, name: 'PresentBadge' })
export function PresentBadge(_p, __bfKey) { return createComponent('PresentBadge__6482dd31', _p, __bfKey) }
export function initLateBadge(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s8] = $(__scope, 's8')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.a
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.b
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.c
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  const __bfw_s3 = lazySlots(__scope, [{ id: 's3', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.d
    __bfw_s3('s3', escapeTextOrNode(__val))
  })

  const __bfw_s4 = lazySlots(__scope, [{ id: 's4', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.e
    __bfw_s4('s4', escapeTextOrNode(__val))
  })

  const __bfw_s5 = lazySlots(__scope, [{ id: 's5', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.f
    __bfw_s5('s5', escapeTextOrNode(__val))
  })

  const __bfw_s6 = lazySlots(__scope, [{ id: 's6', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.g
    __bfw_s6('s6', escapeTextOrNode(__val))
  })

  const __bfw_s7 = lazySlots(__scope, [{ id: 's7', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.h
    __bfw_s7('s7', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s8) {
      { const __x = _p.a
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s8.setAttribute('data-x', String(__v)); else _s8.removeAttribute('data-x') }
      }
      __l[0] = __x }
    }
  }) }

}

hydrate('LateBadge__6482dd31', { init: initLateBadge, template: (_p) => `<i class="badge late-badge" ${(_p.a) != null ? 'data-x="' + escapeAttr(_p.a) + '"' : ''} bf="s8"><!--bf:s0-->${escapeTextOrMarkup(_p.a)}<!--/--><!--bf:s1-->${escapeTextOrMarkup(_p.b)}<!--/--><!--bf:s2-->${escapeTextOrMarkup(_p.c)}<!--/--><!--bf:s3-->${escapeTextOrMarkup(_p.d)}<!--/--><!--bf:s4-->${escapeTextOrMarkup(_p.e)}<!--/--><!--bf:s5-->${escapeTextOrMarkup(_p.f)}<!--/--><!--bf:s6-->${escapeTextOrMarkup(_p.g)}<!--/--><!--bf:s7-->${escapeTextOrMarkup(_p.h)}<!--/--></i>`, name: 'LateBadge' })
export function LateBadge(_p, __bfKey) { return createComponent('LateBadge__6482dd31', _p, __bfKey) }
export function initFragmentRootCondAttrs(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)

  const [shown] = createSignal(true)
  const [late, setLate] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  const [_s1, _s5, _s0, _s3, _s7] = $(__scope, 's1', 's5', 's0', 's3', 's7')
  const [_s2, _s6] = $c(__scope, 's2', 's6')

  insert(__scope, 's0', () => busy(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('busy', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('idle', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's3', () => shown(), {
    template: () => { const __slots = []; return { html: `<button bf-c="s3" ${(`${busy() ? 'action on' : 'action off'}`) != null ? 'class="' + escapeAttr(`${busy() ? 'action on' : 'action off'}`) + '"' : ''} ${(`${busy() ? 'yes' : 'no'}`) != null ? 'data-x="' + escapeAttr(`${busy() ? 'yes' : 'no'}`) + '"' : ''} ${busy() ? 'disabled' : ''} ${busy() ? 'hidden' : ''} bf="s4">action</button>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      { const __ra_s4 = qsa(__branchScope, '[bf="s4"]')
      const __l = []
      if (__ra_s4) {
        __disposers.push(createDisposableEffect(() => {
          { const __x = `${busy() ? 'action on' : 'action off'}`
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
            __ra_s4.disabled = !!(__x)
          }
          __l[2] = __x }
        }))
        __disposers.push(createDisposableEffect(() => {
          { const __x = busy()
          if (!(3 in __l) || !Object.is(__l[3], __x)) {
            __ra_s4.hidden = !!(__x)
          }
          __l[3] = __x }
        }))
      } }
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s3--><!--bf-cond-end:s3-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's7', () => late(), {
    template: () => { const __slots = []; return { html: `<span bf-c="s7" ${(`${busy() ? 'late on' : 'late off'}`) != null ? 'class="' + escapeAttr(`${busy() ? 'late on' : 'late off'}`) + '"' : ''} ${(`${busy() ? 'yes' : 'no'}`) != null ? 'data-x="' + escapeAttr(`${busy() ? 'yes' : 'no'}`) + '"' : ''} ${busy() ? 'hidden' : ''} bf="s8">late</span>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      { const __ra_s8 = qsa(__branchScope, '[bf="s8"]')
      const __l = []
      if (__ra_s8) {
        __disposers.push(createDisposableEffect(() => {
          { const __x = `${busy() ? 'late on' : 'late off'}`
          if (!(0 in __l) || !Object.is(__l[0], __x)) {
            { const __v = __x; if (__v != null) __ra_s8.setAttribute('class', String(__v)); else __ra_s8.removeAttribute('class') }
          }
          __l[0] = __x }
        }))
        __disposers.push(createDisposableEffect(() => {
          { const __x = `${busy() ? 'yes' : 'no'}`
          if (!(1 in __l) || !Object.is(__l[1], __x)) {
            { const __v = __x; if (__v != null) __ra_s8.setAttribute('data-x', String(__v)); else __ra_s8.removeAttribute('data-x') }
          }
          __l[1] = __x }
        }))
        __disposers.push(createDisposableEffect(() => {
          { const __x = busy()
          if (!(2 in __l) || !Object.is(__l[2], __x)) {
            __ra_s8.hidden = !!(__x)
          }
          __l[2] = __x }
        }))
      } }
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s7--><!--bf-cond-end:s7-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s1) _s1.addEventListener('click', () => setBusy(!busy()))
  if (_s5) _s5.addEventListener('click', () => setLate(!late()))

  // Initialize child components with props
  initChild('PresentBadge__6482dd31', _s2, { a: "p", b: "q", c: "r", d: "s" })
  initChild('LateBadge__6482dd31', _s6, { a: "t", b: "u", c: "v", d: "w", e: "x", f: "y", g: "z", h: "0" })
}

hydrate('FragmentRootCondAttrs', { init: initFragmentRootCondAttrs, template: (_p) => `<button class="toggle" bf="s1">${(false) ? `<!--bf-cond-start:s0-->${escapeText('busy')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0-->${escapeText('idle')}<!--bf-cond-end:s0-->`}</button>${renderChild('PresentBadge__6482dd31', {a: "p", b: "q", c: "r", d: "s"}, undefined, 's2')}${(true) ? `<button bf-c="s3" ${(`${(false) ? 'action on' : 'action off'}`) != null ? 'class="' + escapeAttr(`${(false) ? 'action on' : 'action off'}`) + '"' : ''} ${(`${(false) ? 'yes' : 'no'}`) != null ? 'data-x="' + escapeAttr(`${(false) ? 'yes' : 'no'}`) + '"' : ''} ${(false) ? 'disabled' : ''} ${(false) ? 'hidden' : ''} bf="s4">action</button>` : `<!--bf-cond-start:s3--><!--bf-cond-end:s3-->`}<button class="enter" bf="s5">enter</button>${renderChild('LateBadge__6482dd31', {a: "t", b: "u", c: "v", d: "w", e: "x", f: "y", g: "z", h: "0"}, undefined, 's6')}${(false) ? `<span bf-c="s7" ${(`${(false) ? 'late on' : 'late off'}`) != null ? 'class="' + escapeAttr(`${(false) ? 'late on' : 'late off'}`) + '"' : ''} ${(`${(false) ? 'yes' : 'no'}`) != null ? 'data-x="' + escapeAttr(`${(false) ? 'yes' : 'no'}`) + '"' : ''} ${(false) ? 'hidden' : ''} bf="s8">late</span>` : `<!--bf-cond-start:s7--><!--bf-cond-end:s7-->`}`, comment: true, fragmentRoot: true })
export function FragmentRootCondAttrs(_p, __bfKey) { return createComponent('FragmentRootCondAttrs', _p, __bfKey) }
