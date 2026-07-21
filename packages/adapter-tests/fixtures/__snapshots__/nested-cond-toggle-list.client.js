import { $, __bfSlot, createComponent, createDisposableEffect, createEffect, createSignal, escapeAttr, hydrate, insert, mapArray, qsa } from '@barefootjs/client/runtime'


export function initNestedCondToggleList(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [items, setItems] = createSignal(_p.items ?? [])
  createEffect(() => {
    const __val = _p.items
    if (__val !== undefined) setItems(__val)
  })
  const toggle = (id) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, active: !it.active } : it)))
  }

  const [_s3] = $(__scope, 's3')

  mapArray(() => items(), _s3, (item) => String(item.id), (item, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${item().id}" class="toggle-row">${item().hidden ? `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->` : `<button bf-c="s0" ${(`${item().active ? 'toggle-btn on' : 'toggle-btn'}`) != null ? 'class="' + escapeAttr(`${item().active ? 'toggle-btn on' : 'toggle-btn'}`) + '"' : ''} ${(`toggle-${item().id}`) != null ? 'data-testid="' + escapeAttr(`toggle-${item().id}`) + '"' : ''} bf="s2">${item().active ? `<!--bf-cond-start:s1-->${'On'}<!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${'Off'}<!--bf-cond-end:s1-->`}</button>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's0', () => item().hidden, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<button bf-c="s0" ${(`${item().active ? 'toggle-btn on' : 'toggle-btn'}`) != null ? 'class="' + escapeAttr(`${item().active ? 'toggle-btn on' : 'toggle-btn'}`) + '"' : ''} ${(`toggle-${item().id}`) != null ? 'data-testid="' + escapeAttr(`toggle-${item().id}`) + '"' : ''} bf="s2">${item().active ? `<!--bf-cond-start:s1-->${__bfSlot('On', __slots)}<!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${__bfSlot('Off', __slots)}<!--bf-cond-end:s1-->`}</button>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        { const _s2 = qsa(__branchScope, '[bf="s2"]')
          if (_s2) _s2.addEventListener('click', () => { toggle(item().id) })
        }
        const __disposers = []
        { const __ra_s2 = qsa(__branchScope, '[bf="s2"]')
        if (__ra_s2) {
          __disposers.push(createDisposableEffect(() => {
            { const __v = `${item().active ? 'toggle-btn on' : 'toggle-btn'}`; if (__v != null) __ra_s2.setAttribute('class', String(__v)); else __ra_s2.removeAttribute('class') }
          }))
          __disposers.push(createDisposableEffect(() => {
            { const __v = `toggle-${item().id}`; if (__v != null) __ra_s2.setAttribute('data-testid', String(__v)); else __ra_s2.removeAttribute('data-testid') }
          }))
        } }
        __disposers.push(createDisposableEffect(() => {
          insert(__branchScope, 's1', () => item().active, {
            template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1-->${__bfSlot('On', __slots)}<!--bf-cond-end:s1-->`, slots: __slots } },
            bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
            }
          }, {
            template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1-->${__bfSlot('Off', __slots)}<!--bf-cond-end:s1-->`, slots: __slots } },
            bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
            }
          })
        }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l0')

}

hydrate('NestedCondToggleList', { init: initNestedCondToggleList, template: (_p) => `<ul class="toggle-list" bf="s3"><!--bf-loop:l0-->${(_p.items ?? []).map((item) => `<li data-key="${item.id}" class="toggle-row">${item.hidden ? `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->` : `<button bf-c="s0" ${(`${item.active ? 'toggle-btn on' : 'toggle-btn'}`) != null ? 'class="' + escapeAttr(`${item.active ? 'toggle-btn on' : 'toggle-btn'}`) + '"' : ''} ${(`toggle-${item.id}`) != null ? 'data-testid="' + escapeAttr(`toggle-${item.id}`) + '"' : ''} bf="s2">${item.active ? `<!--bf-cond-start:s1-->${'On'}<!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${'Off'}<!--bf-cond-end:s1-->`}</button>`}</li>`).join('')}<!--bf-/loop:l0--></ul>` })
export function NestedCondToggleList(_p, __bfKey) { return createComponent('NestedCondToggleList', _p, __bfKey) }
