import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initReassignedPropCounter(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  let start = _p.start ?? 0

  const [items, setItems] = createSignal([])
  const addPre = () => setItems([...items(), ++start])
  const addStep = () => {
    let laps = 0
    for (let step = 0; step < 2; step++) laps++
    start += (_p.step ?? 1) * laps
    setItems([...items(), start])
  }

  const [_s0, _s1, _s2] = $(__scope, 's0', 's1', 's2')

  const __bfw_s3 = lazySlots(__scope, [{ id: 's3', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = start
    __bfw_s3('s3', escapeTextOrNode(__val))
  })

  const __bfw_s5 = lazySlots(__scope, [{ id: 's5', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = items().join(',')
    __bfw_s5('s5', escapeTextOrNode(__val))
  })

  if (_s0) _s0.addEventListener('click', addPre)
  if (_s1) _s1.addEventListener('click', addStep)
  if (_s2) _s2.addEventListener('click', () => {
          start = start * 2
          setItems([...items(), start])
        })
}

hydrate('ReassignedPropCounter', { init: initReassignedPropCounter, template: (_p) => `<div><button class="add-pre" bf="s0">pre</button><button class="add-step" bf="s1">step</button><button class="add-double" bf="s2">double</button><p class="start" bf="s4"><!--bf:s3-->${escapeTextOrMarkup((_p.start ?? 0))}<!--/--></p><p class="items" bf="s6"><!--bf:s5-->${escapeTextOrMarkup(([]).join(','))}<!--/--></p></div>` })
export function ReassignedPropCounter(_p, __bfKey) { return createComponent('ReassignedPropCounter', _p, __bfKey) }
