import { $, __bfSlot, createComponent, createDisposableEffect, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, getLoopChildren, hydrate, insert, lazySlots, mapArray, mountRowRoot, qsa } from '@barefootjs/client/runtime'


export function initConditionalNestedStatic(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const GROUPS = ['a', 'b']
  const CHOICES = ['1', '2']
  const [open, setOpen] = createSignal(true)
  const [picked, setPicked] = createSignal('a1')

  const [_s0, _s3] = $(__scope, 's0', 's3')

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  insert(__scope, 's3', () => open(), {
    template: () => { const __slots = []; return { html: `<div bf-c="s3" bf="s10"><!--bf-loop:l1-->${GROUPS.map((group) => `<div data-key="${escapeAttr(group)}" bf="s9"><!--bf-loop:l0-->${CHOICES.map((choice) => `<button data-key-1="${escapeAttr(choice)}" ${(`${group}${choice}`) != null ? 'data-choice="' + escapeAttr(`${group}${choice}`) + '"' : ''} ${(`${picked() === `${group}${choice}` ? 'true' : 'false'}`) != null ? 'aria-checked="' + escapeAttr(`${picked() === `${group}${choice}` ? 'true' : 'false'}`) + '"' : ''} bf="s8"><span class="status" bf="s5">${picked() === `${group}${choice}` ? `<!--bf-cond-start:s4-->${__bfSlot('on', __slots)}<!--bf-cond-end:s4-->` : `<!--bf-cond-start:s4-->${__bfSlot('off', __slots)}<!--bf-cond-end:s4-->`}</span><span class="value" bf="s7"><!--bf:s6-->${__bfSlot(picked() + ':' + `${group}${choice}`, __slots)}<!--/--></span></button>`).join('')}<!--bf-/loop:l0--></div>`).join('')}<!--bf-/loop:l1--></div>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      const [__loop_s10] = $(__branchScope, 's10')
      if (__loop_s10 && !__bfFirstRun) getLoopChildren(__loop_s10, 'l1').forEach(__el => __el.remove())
      __disposers.push(createDisposableEffect(() => {
        if (__loop_s10) mapArray(() => GROUPS, __loop_s10, (group) => String(group), (group, __idx, __existing) => {
          const __el = __existing ?? mountRowRoot((() => {
            const __tpl = document.createElement('template')
            __tpl.innerHTML = `<div data-key="${escapeAttr(group())}" bf="s9"><!--bf-loop:l0-->${CHOICES.map((choice) => `<button data-key-1="${escapeAttr(choice)}" ${(`${group()}${choice}`) != null ? 'data-choice="' + escapeAttr(`${group()}${choice}`) + '"' : ''} ${(`${picked() === `${group()}${choice}` ? 'true' : 'false'}`) != null ? 'aria-checked="' + escapeAttr(`${picked() === `${group()}${choice}` ? 'true' : 'false'}`) + '"' : ''} bf="s8"><span class="status" bf="s5">${picked() === `${group()}${choice}` ? `<!--bf-cond-start:s4-->${escapeText('on')}<!--bf-cond-end:s4-->` : `<!--bf-cond-start:s4-->${escapeText('off')}<!--bf-cond-end:s4-->`}</span><span class="value" bf="s7"><!--bf:s6-->${escapeText(picked() + ':' + `${group()}${choice}`)}<!--/--></span></button>`).join('')}<!--bf-/loop:l0--></div>`
            return __tpl.content.firstElementChild.cloneNode(true)
          })())
          // Reactive inner loop: CHOICES
          { const __ic1_0 = qsa(__el, '[bf="s9"]')
          if (__ic1_0) mapArray(() => CHOICES || [], __ic1_0, (choice) => String(choice), (choice, __innerIdx1_0, __existing) => {
            let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<button data-key-1="${escapeAttr(choice())}" ${(`${group()}${choice()}`) != null ? 'data-choice="' + escapeAttr(`${group()}${choice()}`) + '"' : ''} ${(`${picked() === `${group()}${choice()}` ? 'true' : 'false'}`) != null ? 'aria-checked="' + escapeAttr(`${picked() === `${group()}${choice()}` ? 'true' : 'false'}`) + '"' : ''} bf="s8"><span class="status" bf="s5">${picked() === `${group()}${choice()}` ? `<!--bf-cond-start:s4-->${escapeText('on')}<!--bf-cond-end:s4-->` : `<!--bf-cond-start:s4-->${escapeText('off')}<!--bf-cond-end:s4-->`}</span><span class="value" bf="s7"><!--bf:s6-->${escapeText(picked() + ':' + `${group()}${choice()}`)}<!--/--></span></button>`; return __t.content.firstElementChild.cloneNode(true) })()
            __innerEl1_0.setAttribute('data-key-1', String(choice()))
            { const __e = qsa(__innerEl1_0, '[bf="s8"]'); if (__e) __e.addEventListener('click', () => { setPicked(`${group()}${choice()}`) }) }
            const __bfw_s6 = lazySlots(__innerEl1_0, [{ id: 's6', kind: 'text', path: [] }])
            createEffect(() => { __bfw_s6('s6', String(picked() + ':' + `${group()}${choice()}`)) })
            const __l = []
            { const __ta_s8 = qsa(__innerEl1_0, '[bf="s8"]')
            if (__ta_s8) createEffect(() => {
              { const __x = `${group()}${choice()}`
              if (!(0 in __l) || !Object.is(__l[0], __x)) {
                { const __v = __x; if (__v != null) __ta_s8.setAttribute('data-choice', String(__v)); else __ta_s8.removeAttribute('data-choice') }
              }
              __l[0] = __x }
            }) }
            { const __ta_s8 = qsa(__innerEl1_0, '[bf="s8"]')
            if (__ta_s8) createEffect(() => {
              { const __x = `${picked() === `${group()}${choice()}` ? 'true' : 'false'}`
              if (!(1 in __l) || !Object.is(__l[1], __x)) {
                { const __v = __x; if (__v != null) __ta_s8.setAttribute('aria-checked', String(__v)); else __ta_s8.removeAttribute('aria-checked') }
              }
              __l[1] = __x }
            }) }
            insert(__innerEl1_0, 's4', () => picked() === `${group()}${choice()}`, {
              template: () => { const __slots = []; return { html: `<!--bf-cond-start:s4-->${__bfSlot('on', __slots)}<!--bf-cond-end:s4-->`, slots: __slots } },
              bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
              }
            }, {
              template: () => { const __slots = []; return { html: `<!--bf-cond-start:s4-->${__bfSlot('off', __slots)}<!--bf-cond-end:s4-->`, slots: __slots } },
              bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
              }
            })
            return __innerEl1_0
          }, 'l0', undefined, "data-key-1") }
          return __el
        }, 'l1')
      }))
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s3--><!--bf-cond-end:s3-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s0) _s0.addEventListener('click', () => { setOpen(!open()) })
}

hydrate('ConditionalNestedStatic', { init: initConditionalNestedStatic, template: (_p) => `<section bf="s11"><button id="toggle" bf="s0">toggle</button><output bf="s2"><!--bf:s1-->${escapeTextOrMarkup(('a1'))}<!--/--></output>${(true) ? `<div bf-c="s3" bf="s10"><!--bf-loop:l1-->${(['a', 'b']).map((group) => `<div data-key="${escapeAttr(group)}" bf="s9"><!--bf-loop:l0-->${(['1', '2']).map((choice) => `<button data-key-1="${escapeAttr(choice)}" ${(`${group}${choice}`) != null ? 'data-choice="' + escapeAttr(`${group}${choice}`) + '"' : ''} ${(`${('a1') === `${group}${choice}` ? 'true' : 'false'}`) != null ? 'aria-checked="' + escapeAttr(`${('a1') === `${group}${choice}` ? 'true' : 'false'}`) + '"' : ''} bf="s8"><span class="status" bf="s5">${('a1') === `${group}${choice}` ? `<!--bf-cond-start:s4-->${escapeText('on')}<!--bf-cond-end:s4-->` : `<!--bf-cond-start:s4-->${escapeText('off')}<!--bf-cond-end:s4-->`}</span><span class="value" bf="s7"><!--bf:s6-->${escapeText(('a1') + ':' + `${group}${choice}`)}<!--/--></span></button>`).join('')}<!--bf-/loop:l0--></div>`).join('')}<!--bf-/loop:l1--></div>` : `<!--bf-cond-start:s3--><!--bf-cond-end:s3-->`}</section>` })
export function ConditionalNestedStatic(_p, __bfKey) { return createComponent('ConditionalNestedStatic', _p, __bfKey) }
