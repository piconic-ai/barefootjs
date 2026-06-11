import { $, $c, $t, __bfText, createComponent, createContext, createEffect, createMemo, createSignal, escapeAttr, escapeText, hydrate, initChild, provideContext, renderChild, useContext } from '@barefootjs/client/runtime'

var RadioGroupContext = RadioGroupContext ?? createContext()

export function initRadioGroup(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const itemBaseClasses = 'relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none transition-[color,box-shadow]'
  const itemFocusClasses = 'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
  const itemStateClasses = '[&[data-state=checked]]:border-primary [&[data-state=checked]]:bg-primary [&[data-state=checked]]:text-primary-foreground dark:bg-input/30 dark:[&[data-state=checked]]:bg-primary'
  const itemErrorClasses = 'aria-[invalid]:border-destructive aria-[invalid]:ring-3 aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40'
  const itemDisabledClasses = 'disabled:cursor-not-allowed disabled:opacity-50'
  const [internalValue, setInternalValue] = createSignal(_p.defaultValue ?? '')
  const [controlledValue, setControlledValue] = createSignal(_p.value ?? undefined)
  createEffect(() => {
    const __val = _p.value
    if (__val !== undefined) setControlledValue(__val)
  })
  const isControlled = createMemo(() => _p.value !== undefined)
  const currentValue = createMemo(() => isControlled() ? (controlledValue() ?? '') : internalValue())


  // Provide context for child components
  provideContext(RadioGroupContext, {
      value: currentValue,
      onValueChange: (newValue) => {
        if (isControlled()) {
          setControlledValue(newValue)
        } else {
          setInternalValue(newValue)
        }
        _p.onValueChange?.(newValue)
      },
      disabled: () => _p.disabled ?? false,
    })
}

hydrate('RadioGroup', { init: initRadioGroup, template: (_p) => `<div data-slot="radio-group" role="radiogroup" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`grid gap-3 ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`grid gap-3 ${_p.className ?? ''}`) + '"' : ''}>${_p.children}</div>` })
export function RadioGroup(_p, __bfKey) { return createComponent('RadioGroup', _p, __bfKey) }
var RadioGroupContext = RadioGroupContext ?? createContext()

export function initRadioGroupItem(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const itemBaseClasses = 'relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none transition-[color,box-shadow]'
  const itemFocusClasses = 'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
  const itemStateClasses = '[&[data-state=checked]]:border-primary [&[data-state=checked]]:bg-primary [&[data-state=checked]]:text-primary-foreground dark:bg-input/30 dark:[&[data-state=checked]]:bg-primary'
  const itemErrorClasses = 'aria-[invalid]:border-destructive aria-[invalid]:ring-3 aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40'
  const itemDisabledClasses = 'disabled:cursor-not-allowed disabled:opacity-50'
  const itemClasses = `${itemBaseClasses} ${itemFocusClasses} ${itemStateClasses} ${itemErrorClasses} ${itemDisabledClasses}`
  const handleMount = (el) => {
    const ctx = useContext(RadioGroupContext)

    createEffect(() => {
      const isSelected = ctx.value() === _p.value
      el.setAttribute('aria-checked', String(isSelected))
      el.setAttribute('data-state', isSelected ? 'checked' : 'unchecked')

      // Reflect group-level disabled onto the button element
      const isDisabled = _p.disabled || ctx.disabled()
      if (isDisabled) {
        el.setAttribute('disabled', '')
      } else {
        el.removeAttribute('disabled')
      }

      // Update indicator dot visibility
      const indicator = el.querySelector('[data-slot="radio-group-indicator"]')
      if (indicator) {
        indicator.style.display = isSelected ? 'flex' : 'none'
      }
    })

    el.addEventListener('click', () => {
      if (el.hasAttribute('disabled') || ctx.disabled()) return
      ctx.onValueChange(_p.value)
    })
  }

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      _s0.disabled = !!(_p.disabled ?? false)
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `${itemClasses} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) (handleMount)(_s0)
}

hydrate('RadioGroupItem', { init: initRadioGroupItem, template: (_p) => `<button data-slot="radio-group-item" data-state="unchecked" role="radio" aria-checked="false" ${_p.disabled ?? false ? 'disabled' : ''} ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`${(`${('relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none transition-[color,box-shadow]')} ${('focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50')} ${('[&[data-state=checked]]:border-primary [&[data-state=checked]]:bg-primary [&[data-state=checked]]:text-primary-foreground dark:bg-input/30 dark:[&[data-state=checked]]:bg-primary')} ${('aria-[invalid]:border-destructive aria-[invalid]:ring-3 aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40')} ${('disabled:cursor-not-allowed disabled:opacity-50')}`)} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${(`${('relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none transition-[color,box-shadow]')} ${('focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50')} ${('[&[data-state=checked]]:border-primary [&[data-state=checked]]:bg-primary [&[data-state=checked]]:text-primary-foreground dark:bg-input/30 dark:[&[data-state=checked]]:bg-primary')} ${('aria-[invalid]:border-destructive aria-[invalid]:ring-3 aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40')} ${('disabled:cursor-not-allowed disabled:opacity-50')}`)} ${_p.className ?? ''}`) + '"' : ''} bf="s0"><span data-slot="radio-group-indicator" class="flex size-4 items-center justify-center" style="display:none"><span class="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground"></span></span></button>` })
export function RadioGroupItem(_p, __bfKey) { return createComponent('RadioGroupItem', _p, __bfKey) }
export function initRadioGroupBasicDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [density, setDensity] = createSignal('default')

  const [_s4] = $t(__scope, 's4')
  const [_s3, _s0, _s1, _s2] = $c(__scope, 's3', 's0', 's1', 's2')

  let __anchor_s4 = _s4
  createEffect(() => {
    const __val = density()
    __anchor_s4 = __bfText(__anchor_s4, __val)
  })


  // Initialize child components with props
  initChild('RadioGroup', _s3, { defaultValue: "default", onValueChange: setDensity })
  initChild('RadioGroupItem', _s0, { value: "default" })
  initChild('RadioGroupItem', _s1, { value: "comfortable" })
  initChild('RadioGroupItem', _s2, { value: "compact" })
}

hydrate('RadioGroupBasicDemo', { init: initRadioGroupBasicDemo, template: (_p) => `<div class="space-y-4">${renderChild('RadioGroup', {defaultValue: "default", children: `<div class="flex items-center space-x-2">${renderChild('RadioGroupItem', {value: "default"}, undefined, 's0')}<span class="text-sm font-medium leading-none">Default</span></div><div class="flex items-center space-x-2">${renderChild('RadioGroupItem', {value: "comfortable"}, undefined, 's1')}<span class="text-sm font-medium leading-none">Comfortable</span></div><div class="flex items-center space-x-2">${renderChild('RadioGroupItem', {value: "compact"}, undefined, 's2')}<span class="text-sm font-medium leading-none">Compact</span></div>`}, undefined, 's3')}<div class="text-sm text-muted-foreground pt-2 border-t" bf="s5"> Selected: <!--bf:s4-->${escapeText(('default'))}<!--/--></div></div>` })
export function RadioGroupBasicDemo(_p, __bfKey) { return createComponent('RadioGroupBasicDemo', _p, __bfKey) }
export function initRadioGroupFormDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [notifyType, setNotifyType] = createSignal('all')
  const [theme, setTheme] = createSignal('system')
  const summary = createMemo(() =>
    `Notifications: ${notifyType()}, Theme: ${theme()}`)

  const [_s8] = $t(__scope, 's8')
  const [_s3, _s0, _s1, _s2, _s7, _s4, _s5, _s6] = $c(__scope, 's3', 's0', 's1', 's2', 's7', 's4', 's5', 's6')

  let __anchor_s8 = _s8
  createEffect(() => {
    const __val = summary()
    __anchor_s8 = __bfText(__anchor_s8, __val)
  })


  // Initialize child components with props
  initChild('RadioGroup', _s3, { defaultValue: "all", onValueChange: setNotifyType })
  initChild('RadioGroupItem', _s0, { value: "all" })
  initChild('RadioGroupItem', _s1, { value: "mentions" })
  initChild('RadioGroupItem', _s2, { value: "none" })
  initChild('RadioGroup', _s7, { defaultValue: "system", onValueChange: setTheme })
  initChild('RadioGroupItem', _s4, { value: "light" })
  initChild('RadioGroupItem', _s5, { value: "dark" })
  initChild('RadioGroupItem', _s6, { value: "system" })
}

hydrate('RadioGroupFormDemo', { init: initRadioGroupFormDemo, template: (_p) => `<div class="space-y-6"><div class="space-y-3"><h4 class="text-sm font-medium leading-none">Notify me about...</h4>${renderChild('RadioGroup', {defaultValue: "all", children: `<div class="flex items-center space-x-2">${renderChild('RadioGroupItem', {value: "all"}, undefined, 's0')}<span class="text-sm leading-none">All new messages</span></div><div class="flex items-center space-x-2">${renderChild('RadioGroupItem', {value: "mentions"}, undefined, 's1')}<span class="text-sm leading-none">Direct messages and mentions</span></div><div class="flex items-center space-x-2">${renderChild('RadioGroupItem', {value: "none"}, undefined, 's2')}<span class="text-sm leading-none">Nothing</span></div>`}, undefined, 's3')}</div><div class="space-y-3"><h4 class="text-sm font-medium leading-none">Theme</h4>${renderChild('RadioGroup', {defaultValue: "system", children: `<div class="flex items-center space-x-2">${renderChild('RadioGroupItem', {value: "light"}, undefined, 's4')}<span class="text-sm leading-none">Light</span></div><div class="flex items-center space-x-2">${renderChild('RadioGroupItem', {value: "dark"}, undefined, 's5')}<span class="text-sm leading-none">Dark</span></div><div class="flex items-center space-x-2">${renderChild('RadioGroupItem', {value: "system"}, undefined, 's6')}<span class="text-sm leading-none">System</span></div>`}, undefined, 's7')}</div><div class="text-sm text-muted-foreground pt-2 border-t" bf="s9"><!--bf:s8-->${escapeText((`Notifications: ${('all')}, Theme: ${('system')}`))}<!--/--></div></div>` })
export function RadioGroupFormDemo(_p, __bfKey) { return createComponent('RadioGroupFormDemo', _p, __bfKey) }
export function initRadioGroupCardDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [plan, setPlan] = createSignal('startup')

  const [_s4] = $t(__scope, 's4')
  const [_s3, _s0, _s1, _s2] = $c(__scope, 's3', 's0', 's1', 's2')

  let __anchor_s4 = _s4
  createEffect(() => {
    const __val = plan()
    __anchor_s4 = __bfText(__anchor_s4, __val)
  })


  // Initialize child components with props
  initChild('RadioGroup', _s3, { defaultValue: "startup", onValueChange: setPlan, className: "grid-cols-1 sm:grid-cols-3" })
  initChild('RadioGroupItem', _s0, { value: "startup" })
  initChild('RadioGroupItem', _s1, { value: "business" })
  initChild('RadioGroupItem', _s2, { value: "enterprise" })
}

hydrate('RadioGroupCardDemo', { init: initRadioGroupCardDemo, template: (_p) => `<div class="space-y-4">${renderChild('RadioGroup', {defaultValue: "startup", className: "grid-cols-1 sm:grid-cols-3", children: `<div class="relative"><label class="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50 cursor-pointer">${renderChild('RadioGroupItem', {value: "startup"}, undefined, 's0')}<div class="space-y-1"><span class="text-sm font-medium leading-none">Startup</span><p class="text-xl font-bold text-foreground">$29<span class="text-sm font-normal text-muted-foreground">/mo</span></p><p class="text-sm text-muted-foreground">For small teams getting started</p></div></label></div><div class="relative"><label class="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50 cursor-pointer">${renderChild('RadioGroupItem', {value: "business"}, undefined, 's1')}<div class="space-y-1"><span class="text-sm font-medium leading-none">Business</span><p class="text-xl font-bold text-foreground">$99<span class="text-sm font-normal text-muted-foreground">/mo</span></p><p class="text-sm text-muted-foreground">For growing companies</p></div></label></div><div class="relative"><label class="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50 cursor-pointer">${renderChild('RadioGroupItem', {value: "enterprise"}, undefined, 's2')}<div class="space-y-1"><span class="text-sm font-medium leading-none">Enterprise</span><p class="text-xl font-bold text-foreground">$299<span class="text-sm font-normal text-muted-foreground">/mo</span></p><p class="text-sm text-muted-foreground">For large organizations</p></div></label></div>`}, undefined, 's3')}<div class="text-sm text-muted-foreground pt-2 border-t" bf="s5"> Selected plan: <!--bf:s4-->${escapeText(('startup'))}<!--/--></div></div>` })
export function RadioGroupCardDemo(_p, __bfKey) { return createComponent('RadioGroupCardDemo', _p, __bfKey) }
