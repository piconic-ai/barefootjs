import { $, createComponent, createEffect, createSignal, hydrate } from '@barefootjs/client/runtime'


export function initDetailsFaq(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)

  const [_s0, _s1] = $(__scope, 's0', 's1')

  createEffect(() => {
    if (_s1) {
      _s1.open = !!(open())
    }
  })

  if (_s0) _s0.addEventListener('click', (e) => {
          e.preventDefault()
          setOpen(!open())
        })
}

hydrate('DetailsFaq', { init: initDetailsFaq, template: (_p) => `<details class="faq-details" ${(false) ? 'open' : ''} bf="s1"><summary class="faq-summary" bf="s0"> What is BarefootJS? </summary><p class="faq-body">A JSX-to-marked-template compiler with signal-based reactivity.</p></details>` })
export function DetailsFaq(_p, __bfKey) { return createComponent('DetailsFaq', _p, __bfKey) }
