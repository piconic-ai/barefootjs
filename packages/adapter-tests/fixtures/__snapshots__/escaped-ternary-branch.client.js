import { $, $c, __bfSlot, createComponent, createEffect, createMemo, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, initChild, insert, lazySlots, mapArrayLazy, qsa, renderChild, textOrNode } from '@barefootjs/client/runtime'

export function initEscapedTernaryLabel(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0, _s1] = $(__scope, 's0', 's1')

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = `${_p.on ? 'c\nd' : 'e\'f'}`
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('data-c', String(__v)); else _s1.removeAttribute('data-c') }
      }
      __l[0] = __x }
      { const __x = _p.text
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('title', String(__v)); else _s1.removeAttribute('title') }
      }
      __l[1] = __x }
    }
  }) }

  insert(__scope, 's0', () => _p.on, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('g\\h', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('i\'j', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

}

hydrate('EscapedTernaryLabel', { init: initEscapedTernaryLabel, template: (_p) => `<em ${(`${_p.on ? 'c\nd' : 'e\'f'}`) != null ? 'data-c="' + escapeAttr(`${_p.on ? 'c\nd' : 'e\'f'}`) + '"' : ''} ${(_p.text) != null ? 'title="' + escapeAttr(_p.text) + '"' : ''} bf="s1">${_p.on ? `<!--bf-cond-start:s0-->${escapeText('g\\h')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0-->${escapeText('i\'j')}<!--bf-cond-end:s0-->`}</em>` })
export function EscapedTernaryLabel(_p, __bfKey) { return createComponent('EscapedTernaryLabel', _p, __bfKey) }
export function initEscapedTernaryBranch(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)
  const memo = createMemo(() => (open() ? 'm\\n' : 'o\'p'))

  const [_s12, _s0, _s2, _s4, _s11, _s13, _s1] = $(__scope, 's12', 's0', 's2', 's4', 's11', 's13', 's1')
  const [_s8] = $c(__scope, 's8')

  const __bfw_s6 = lazySlots(__scope, [{ id: 's6', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = memo()
    __bfw_s6('s6', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s13) {
      { const __x = `${(_p.on ?? true) ? 'a\nb' : 'c'}`
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s13.setAttribute('data-a', String(__v)); else _s13.removeAttribute('data-a') }
      }
      __l[0] = __x }
      { const __x = `${open() ? 'it\'s' : 'back\\slash'}`
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s13.setAttribute('data-q', String(__v)); else _s13.removeAttribute('data-q') }
      }
      __l[1] = __x }
    }
  }) }

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = `k ${(_p.on ?? true) ? 'q\'y	x' : 'tab'}`
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('data-t', String(__v)); else _s1.removeAttribute('data-t') }
      }
      __l[0] = __x }
      { const __x = `v ${open() ? 'w\\z' : 'w"z'}`
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('data-u', String(__v)); else _s1.removeAttribute('data-u') }
      }
      __l[1] = __x }
    }
  }) }

  insert(__scope, 's0', () => (_p.on ?? true), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('l\nm', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('n', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's2', () => open(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s2-->${__bfSlot('o\'n', __slots)}<!--bf-cond-end:s2-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s2-->${__bfSlot('of\\f', __slots)}<!--bf-cond-end:s2-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's4', () => (_p.on ?? true), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s4-->${__bfSlot('quote\'s \\ end', __slots)}<!--bf-cond-end:s4-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s4--><!--bf-cond-end:s4-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s12) _s12.addEventListener('click', () => setOpen(!open()))

  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__EscapedTernaryLabel_s8El] = $c(__scope, 's8')
    if (__EscapedTernaryLabel_s8El) {
      { const __x = (_p.on ?? true)
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __EscapedTernaryLabel_s8El.hasAttribute('on')) { const __v = __x; if (__v != null) __EscapedTernaryLabel_s8El.setAttribute('on', String(__v)); else __EscapedTernaryLabel_s8El.removeAttribute('on') }
      }
      __l[0] = __x }
      { const __x = `${open() ? 'p\nq' : 'r\'s'}`
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        if (__m[1] ??= __EscapedTernaryLabel_s8El.hasAttribute('text')) { const __v = __x; if (__v != null) __EscapedTernaryLabel_s8El.setAttribute('text', String(__v)); else __EscapedTernaryLabel_s8El.removeAttribute('text') }
      }
      __l[1] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('EscapedTernaryLabel', _s8, { get on() { return (_p.on ?? true) }, get text() { return `${open() ? 'p\nq' : 'r\'s'}` } })
  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<li data-key="" bf="s10"><!--bf:s9--><!--/--></li>`
  const __lzp_l0 = [[0]]
  const __lzs_l0 = [{ id: 's9', kind: 'text', path: [] }]
  const __lzsc_l0 = [{ id: 's9', kind: 'text', path: __lzp_l0[0] }]
  mapArrayLazy(() => (_p.items ?? []), _s11, (item) => String(item), {
    createRow: (__e, __idx) => {
      const item = () => __e.item
      const __el = __tpl_l0.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [__el, lazySlots(__el, __lzsc_l0)]
      const __l = __e.last = []
      { const __t = __r[0]
      if (__t) {
        { const __x = `${open() ? 'r\'1' : 'r\\2'}`
        { const __v = __x; if (__v != null) __t.setAttribute('data-row', String(__v)); else __t.removeAttribute('data-row') }
        __l[0] = __x }
      } }
      { const __t = __r[0]
      if (__t) {
        { const __x = `${(_p.on ?? true) ? 's\n1' : 's2'}`
        { const __v = __x; if (__v != null) __t.setAttribute('data-s', String(__v)); else __t.removeAttribute('data-s') }
        __l[1] = __x }
      } }
      { const __x = item()
      __r[1]('s9', textOrNode(__x))
      __l[2] = __x }
      return __el
    },
    applyItem: (__e) => {
      const item = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[1] ?? (__r[1] = lazySlots(__e.primaryEl, __lzs_l0))
      { const __x = item()
      if (!(2 in __l) || !Object.is(__l[2], __x)) __d('s9', textOrNode(__x))
      __l[2] = __x }
    },
    applyOuter: (__es, __seed) => {
      open()
      for (const __e of __es) {
        const item = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __t = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf="s10"]'))
        if (__t) {
          { const __x = `${open() ? 'r\'1' : 'r\\2'}`
          if (__seed ? (__t.getAttribute('data-row') !== (__x != null ? String(__x) : null)) : (!(0 in __l) || !Object.is(__l[0], __x))) {
            { const __v = __x; if (__v != null) __t.setAttribute('data-row', String(__v)); else __t.removeAttribute('data-row') }
          }
          __l[0] = __x }
        } }
        { const __t = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf="s10"]'))
        if (__t) {
          { const __x = `${(_p.on ?? true) ? 's\n1' : 's2'}`
          if (__seed ? (__t.getAttribute('data-s') !== (__x != null ? String(__x) : null)) : (!(1 in __l) || !Object.is(__l[1], __x))) {
            { const __v = __x; if (__v != null) __t.setAttribute('data-s', String(__v)); else __t.removeAttribute('data-s') }
          }
          __l[1] = __x }
        } }
      }
    },
  }, 'l0')

}

hydrate('EscapedTernaryBranch', { init: initEscapedTernaryBranch, template: (_p) => `<div ${(`${(_p.on ?? true) ? 'a\nb' : 'c'}`) != null ? 'data-a="' + escapeAttr(`${(_p.on ?? true) ? 'a\nb' : 'c'}`) + '"' : ''} ${(`${(false) ? 'it\'s' : 'back\\slash'}`) != null ? 'data-q="' + escapeAttr(`${(false) ? 'it\'s' : 'back\\slash'}`) + '"' : ''} bf="s13"><p ${(`k ${(_p.on ?? true) ? 'q\'y	x' : 'tab'}`) != null ? 'data-t="' + escapeAttr(`k ${(_p.on ?? true) ? 'q\'y	x' : 'tab'}`) + '"' : ''} ${(`v ${(false) ? 'w\\z' : 'w"z'}`) != null ? 'data-u="' + escapeAttr(`v ${(false) ? 'w\\z' : 'w"z'}`) + '"' : ''} bf="s1">${(_p.on ?? true) ? `<!--bf-cond-start:s0-->${escapeText('l\nm')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0-->${escapeText('n')}<!--bf-cond-end:s0-->`}</p><span data-slot="text" bf="s3">${(false) ? `<!--bf-cond-start:s2-->${escapeText('o\'n')}<!--bf-cond-end:s2-->` : `<!--bf-cond-start:s2-->${escapeText('of\\f')}<!--bf-cond-end:s2-->`}</span><span data-slot="and" bf="s5">${(_p.on ?? true) ? `<!--bf-cond-start:s4-->${escapeText('quote\'s \\ end')}<!--bf-cond-end:s4-->` : `<!--bf-cond-start:s4--><!--bf-cond-end:s4-->`}</span><span data-slot="memo" bf="s7"><!--bf:s6-->${escapeTextOrMarkup((((false) ? 'm\\n' : 'o\'p')))}<!--/--></span>${renderChild('EscapedTernaryLabel', {on: (_p.on ?? true), text: `${(false) ? 'p\nq' : 'r\'s'}`}, undefined, 's8')}<ul bf="s11"><!--bf-loop:l0-->${(_p.items ?? []).map((item) => `<li data-key="${escapeAttr(item)}" ${(`${(false) ? 'r\'1' : 'r\\2'}`) != null ? 'data-row="' + escapeAttr(`${(false) ? 'r\'1' : 'r\\2'}`) + '"' : ''} ${(`${(_p.on ?? true) ? 's\n1' : 's2'}`) != null ? 'data-s="' + escapeAttr(`${(_p.on ?? true) ? 's\n1' : 's2'}`) + '"' : ''} bf="s10"><!--bf:s9-->${escapeText(item)}<!--/--></li>`).join('')}<!--bf-/loop:l0--></ul><button bf="s12">toggle</button></div>` })
export function EscapedTernaryBranch(_p, __bfKey) { return createComponent('EscapedTernaryBranch', _p, __bfKey) }
