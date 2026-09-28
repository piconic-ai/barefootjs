import { $, createComponent, createEffect, createMutation, http, hydrate, insert } from '@barefootjs/client/runtime'


export function initCreateMutationForm(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [saved, save] = createMutation(() => http.post('/api/posts/' + _p.postId + '/comments', { body: { text: 'hi' } }), { invalidates: ['/api/posts'] })

  const [_s2, _s0, _s1] = $(__scope, 's2', 's0', 's1')

  { const __l = []
  createEffect(() => {
    if (_s2) {
      { const __x = save.isPending()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s2.disabled = !!(__x)
      }
      __l[0] = __x }
    }
  }) }

  insert(__scope, 's0', () => save.error(), {
    template: () => { const __slots = []; return { html: `<p bf-c="s0" role="alert">Failed to save</p>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's1', () => saved(), {
    template: () => { const __slots = []; return { html: `<p bf-c="s1">Saved</p>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1--><!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s2) _s2.addEventListener('click', () => { save() })
}

hydrate('CreateMutationForm', { init: initCreateMutationForm, template: (_p) => `<form bf="s3">${undefined ? `<p bf-c="s0" role="alert">Failed to save</p>` : `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`}${(undefined) ? `<p bf-c="s1">Saved</p>` : `<!--bf-cond-start:s1--><!--bf-cond-end:s1-->`}<button type="button" ${false ? 'disabled' : ''} bf="s2"> Send </button></form>` })
export function CreateMutationForm(_p, __bfKey) { return createComponent('CreateMutationForm', _p, __bfKey) }
