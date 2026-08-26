import { $, createComponent, createEffect, createSignal, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initNoteBoxNative(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [note, setNote] = createSignal('initial note')

  const [_s0] = $(__scope, 's0')

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = note()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  createEffect(() => {
    if (_s0) {
      const __val = String(note())
      if (_s0.value !== __val) _s0.value = __val
    }
  })

  if (_s0) _s0.addEventListener('input', (e) => { setNote(e.target.value) })
}

hydrate('NoteBoxNative', { init: initNoteBoxNative, template: (_p) => `<div class="notebox"><textarea class="note-textarea" bf="s0">${escapeText(('initial note'))}</textarea><p class="note-preview" bf="s2"><!--bf:s1-->${escapeTextOrMarkup(('initial note'))}<!--/--></p></div>` })
export function NoteBoxNative(_p, __bfKey) { return createComponent('NoteBoxNative', _p, __bfKey) }
