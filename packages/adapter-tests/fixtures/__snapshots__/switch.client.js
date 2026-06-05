import { $, createComponent, createEffect, createMemo, createSignal, escapeAttr, hydrate } from '@barefootjs/client/runtime'


export function initSwitch(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const trackBaseClasses = 'peer inline-flex h-5 w-9 shrink-0 items-center rounded-xl p-0.5 shadow-xs transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50'
  const trackFocusClasses = 'focus-visible:ring-ring/50 focus-visible:ring-[3px]'
  const trackStateClasses = [
  '[&[data-state=unchecked]]:bg-input',
  'dark:[&[data-state=unchecked]]:bg-input/80',
  '[&[data-state=checked]]:bg-primary',
].join(' ')
  const thumbBaseClasses = 'pointer-events-none block size-4 rounded-xl bg-background shadow-sm ring-0 transition-transform dark:[&[data-state=unchecked]]:bg-foreground dark:[&[data-state=checked]]:bg-primary-foreground'
  const thumbStateClasses = [
  '[&[data-state=unchecked]]:translate-x-0',
  '[&[data-state=checked]]:translate-x-4',
].join(' ')
  const [internalChecked, setInternalChecked] = createSignal(_p.defaultChecked ?? false)
  const [controlledChecked, setControlledChecked] = createSignal(_p.checked ?? undefined)
  createEffect(() => {
    const __val = _p.checked
    if (__val !== undefined) setControlledChecked(__val)
  })
  const isControlled = createMemo(() => _p.checked !== undefined)
  const isChecked = createMemo(() => isControlled() ? controlledChecked() : internalChecked())
  const updateSwitchUI = (track, newValue) => {
    const state = newValue ? 'checked' : 'unchecked'

    // Update track ARIA and data attributes
    track.setAttribute('aria-checked', String(newValue))
    track.setAttribute('data-state', state)

    // Update thumb data-state
    const thumb = track.querySelector('[data-slot="switch-thumb"]')
    if (thumb) {
      thumb.setAttribute('data-state', state)
    }
  }
  const handleClick = (e) => {
    const target = e.currentTarget
    const currentChecked = target.getAttribute('aria-checked') === 'true'
    const newValue = !currentChecked

    // Update state based on mode
    if (isControlled()) {
      setControlledChecked(newValue)
    } else {
      setInternalChecked(newValue)
    }

    // Update the UI visually
    updateSwitchUI(target, newValue)

    // Notify parent if callback provided
    // Check scope element for callback (parent sets callback there during hydration)
    const scope = target.closest('[bf-s]')
    // @ts-ignore - oncheckedChange is set by parent during hydration
    const scopeCallback = scope?.oncheckedChange
    const handler = _p.onCheckedChange || scopeCallback
    handler?.(newValue)
  }

  const [_s1, _s0] = $(__scope, 's1', 's0')

  createEffect(() => {
    if (_s1) {
      { const __v = `${isChecked() ? 'checked' : 'unchecked'}`; if (__v != null) _s1.setAttribute('data-state', String(__v)); else _s1.removeAttribute('data-state') }
      { const __v = _p.id; if (__v != null) _s1.setAttribute('id', String(__v)); else _s1.removeAttribute('id') }
      { const __v = isChecked(); if (__v != null) _s1.setAttribute('aria-checked', String(__v)); else _s1.removeAttribute('aria-checked') }
      _s1.disabled = !!(_p.disabled ?? false)
      { const __v = `peer inline-flex h-5 w-9 shrink-0 items-center rounded-xl p-0.5 shadow-xs transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-ring/50 focus-visible:ring-[3px] ${trackStateClasses} ${_p.className ?? ''}`; if (__v != null) _s1.setAttribute('class', String(__v)); else _s1.removeAttribute('class') }
    }
  })

  createEffect(() => {
    if (_s0) {
      { const __v = `${isChecked() ? 'checked' : 'unchecked'}`; if (__v != null) _s0.setAttribute('data-state', String(__v)); else _s0.removeAttribute('data-state') }
    }
  })

  if (_s1) _s1.addEventListener('click', handleClick)
}

hydrate('Switch', { init: initSwitch, template: (_p) => `<button data-slot="switch" ${(`${((_p.checked !== undefined) ? (_p.checked ?? undefined) : (_p.defaultChecked ?? false)) ? 'checked' : 'unchecked'}`) != null ? 'data-state="' + escapeAttr(`${((_p.checked !== undefined) ? (_p.checked ?? undefined) : (_p.defaultChecked ?? false)) ? 'checked' : 'unchecked'}`) + '"' : ''} role="switch" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(((_p.checked !== undefined) ? (_p.checked ?? undefined) : (_p.defaultChecked ?? false))) != null ? 'aria-checked="' + escapeAttr(((_p.checked !== undefined) ? (_p.checked ?? undefined) : (_p.defaultChecked ?? false))) + '"' : ''} ${_p.disabled ?? false ? 'disabled' : ''} ${(`peer inline-flex h-5 w-9 shrink-0 items-center rounded-xl p-0.5 shadow-xs transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-ring/50 focus-visible:ring-[3px] ${([
  '[&[data-state=unchecked]]:bg-input',
  'dark:[&[data-state=unchecked]]:bg-input/80',
  '[&[data-state=checked]]:bg-primary',
].join(' '))} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`peer inline-flex h-5 w-9 shrink-0 items-center rounded-xl p-0.5 shadow-xs transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-ring/50 focus-visible:ring-[3px] ${([
  '[&[data-state=unchecked]]:bg-input',
  'dark:[&[data-state=unchecked]]:bg-input/80',
  '[&[data-state=checked]]:bg-primary',
].join(' '))} ${_p.className ?? ''}`) + '"' : ''} bf="s1"><span data-slot="switch-thumb" ${(`${((_p.checked !== undefined) ? (_p.checked ?? undefined) : (_p.defaultChecked ?? false)) ? 'checked' : 'unchecked'}`) != null ? 'data-state="' + escapeAttr(`${((_p.checked !== undefined) ? (_p.checked ?? undefined) : (_p.defaultChecked ?? false)) ? 'checked' : 'unchecked'}`) + '"' : ''} ${(`pointer-events-none block size-4 rounded-xl bg-background shadow-sm ring-0 transition-transform dark:[&[data-state=unchecked]]:bg-foreground dark:[&[data-state=checked]]:bg-primary-foreground ${([
  '[&[data-state=unchecked]]:translate-x-0',
  '[&[data-state=checked]]:translate-x-4',
].join(' '))}`) != null ? 'class="' + escapeAttr(`pointer-events-none block size-4 rounded-xl bg-background shadow-sm ring-0 transition-transform dark:[&[data-state=unchecked]]:bg-foreground dark:[&[data-state=checked]]:bg-primary-foreground ${([
  '[&[data-state=unchecked]]:translate-x-0',
  '[&[data-state=checked]]:translate-x-4',
].join(' '))}`) + '"' : ''} bf="s0"></span></button>` })
export function Switch(_p, __bfKey) { return createComponent('Switch', _p, __bfKey) }
