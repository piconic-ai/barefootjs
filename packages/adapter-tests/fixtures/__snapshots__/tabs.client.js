import { $, $c, applyRestAttrs, createComponent, createEffect, createMemo, createSignal, escapeAttr, hydrate, initChild, renderChild } from '@barefootjs/client/runtime'

export function initTabs(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const value = _p.value
  const defaultValue = _p.defaultValue
  const className = _p.className ?? ''
  const children = _p.children

  const tabsClasses = 'flex flex-col gap-2 w-full'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.value || _p.defaultValue; if (__v != null) _s0.setAttribute('data-value', String(__v)); else _s0.removeAttribute('data-value') }
      { const __v = `${tabsClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","value","defaultValue","children","data-slot","data-value","class"])

}

hydrate('Tabs', { init: initTabs, template: (_p) => `<div data-slot="tabs" ${(_p.value || _p.defaultValue) != null ? 'data-value="' + escapeAttr(_p.value || _p.defaultValue) + '"' : ''} ${(`${('flex flex-col gap-2 w-full')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('flex flex-col gap-2 w-full')} ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function Tabs(_p, __bfKey) { return createComponent('Tabs', _p, __bfKey) }
export function initTabsList(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className ?? ''
  const children = _p.children

  const tabsListClasses = 'bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `${tabsListClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","children","data-slot","role","class"])

}

hydrate('TabsList', { init: initTabsList, template: (_p) => `<div data-slot="tabs-list" role="tablist" ${(`${('bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]')} ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function TabsList(_p, __bfKey) { return createComponent('TabsList', _p, __bfKey) }
export function initTabsTrigger(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const tabsTriggerBaseClasses = 'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4'
  const tabsTriggerFocusClasses = 'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
  const tabsTriggerStateClasses = 'text-foreground data-[state=active]:bg-background data-[state=active]:shadow-sm dark:text-muted-foreground dark:data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30'
  const handleKeyDown = (e) => {
    const target = e.currentTarget
    const tabList = target.closest('[role="tablist"]')
    if (!tabList) return

    const tabs = tabList.querySelectorAll('[role="tab"]:not([disabled])')
    const currentIndex = Array.from(tabs).indexOf(target)

    let nextIndex = null

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0
        break
      case 'ArrowLeft':
        e.preventDefault()
        nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1
        break
      case 'Home':
        e.preventDefault()
        nextIndex = 0
        break
      case 'End':
        e.preventDefault()
        nextIndex = tabs.length - 1
        break
    }

    if (nextIndex !== null && tabs[nextIndex]) {
      const nextTab = tabs[nextIndex]
      nextTab.focus()
      nextTab.click()
    }
  }

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.selected ?? false; if (__v != null) _s0.setAttribute('aria-selected', String(__v)); else _s0.removeAttribute('aria-selected') }
      _s0.disabled = !!(_p.disabled ?? false)
      { const __v = `${(_p.selected ?? false) ? 'active' : 'inactive'}`; if (__v != null) _s0.setAttribute('data-state', String(__v)); else _s0.removeAttribute('data-state') }
      { const __v = _p.value; if (__v != null) _s0.setAttribute('data-value', String(__v)); else _s0.removeAttribute('data-value') }
      { const __v = (_p.selected ?? false) ? 0 : -1; if (__v != null) _s0.setAttribute('tabindex', String(__v)); else _s0.removeAttribute('tabindex') }
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] text-foreground data-[state=active]:bg-background data-[state=active]:shadow-sm dark:text-muted-foreground dark:data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) _s0.addEventListener('click', _p.onClick)
  if (_s0) _s0.addEventListener('keydown', handleKeyDown)
}

hydrate('TabsTrigger', { init: initTabsTrigger, template: (_p) => `<button data-slot="tabs-trigger" role="tab" ${(_p.selected ?? false) != null ? 'aria-selected="' + escapeAttr(_p.selected ?? false) + '"' : ''} ${_p.disabled ?? false ? 'disabled' : ''} ${(`${(_p.selected ?? false) ? 'active' : 'inactive'}`) != null ? 'data-state="' + escapeAttr(`${(_p.selected ?? false) ? 'active' : 'inactive'}`) + '"' : ''} ${(_p.value) != null ? 'data-value="' + escapeAttr(_p.value) + '"' : ''} ${((_p.selected ?? false) ? 0 : -1) != null ? 'tabindex="' + escapeAttr((_p.selected ?? false) ? 0 : -1) + '"' : ''} ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] text-foreground data-[state=active]:bg-background data-[state=active]:shadow-sm dark:text-muted-foreground dark:data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] text-foreground data-[state=active]:bg-background data-[state=active]:shadow-sm dark:text-muted-foreground dark:data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 ${_p.className ?? ''}`) + '"' : ''} bf="s0">${_p.children}</button>` })
export function TabsTrigger(_p, __bfKey) { return createComponent('TabsTrigger', _p, __bfKey) }
export function initTabsContent(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `${(_p.selected ?? false) ? 'active' : 'inactive'}`; if (__v != null) _s0.setAttribute('data-state', String(__v)); else _s0.removeAttribute('data-state') }
      { const __v = _p.value; if (__v != null) _s0.setAttribute('data-value', String(__v)); else _s0.removeAttribute('data-value') }
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `flex-1 outline-none ${(_p.selected ?? false) ? '' : 'hidden'} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

}

hydrate('TabsContent', { init: initTabsContent, template: (_p) => `<div data-slot="tabs-content" role="tabpanel" ${(0) != null ? 'tabindex="' + escapeAttr(0) + '"' : ''} ${(`${(_p.selected ?? false) ? 'active' : 'inactive'}`) != null ? 'data-state="' + escapeAttr(`${(_p.selected ?? false) ? 'active' : 'inactive'}`) + '"' : ''} ${(_p.value) != null ? 'data-value="' + escapeAttr(_p.value) + '"' : ''} ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`flex-1 outline-none ${(_p.selected ?? false) ? '' : 'hidden'} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`flex-1 outline-none ${(_p.selected ?? false) ? '' : 'hidden'} ${_p.className ?? ''}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function TabsContent(_p, __bfKey) { return createComponent('TabsContent', _p, __bfKey) }
export function initTabsBasicDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [activeTab, setActiveTab] = createSignal('account')
  const isAccountSelected = createMemo(() => activeTab() === 'account')
  const isPasswordSelected = createMemo(() => activeTab() === 'password')

  const [_s5, _s0, _s1, _s3, _s4, _s2] = $c(__scope, 's5', 's0', 's1', 's3', 's4', 's2')


  // Reactive prop bindings
  createEffect(() => {
    if (_s5) {
      const __val = String(activeTab())
      if (_s5.value !== __val) _s5.value = __val
    }
    if (_s0) {
      _s0.setAttribute('aria-selected', String(isAccountSelected()))
      _s0.setAttribute('data-state', isAccountSelected() ? 'active' : 'inactive')
      _s0.setAttribute('tabindex', isAccountSelected() ? '0' : '-1')
    }
    if (_s1) {
      _s1.setAttribute('aria-selected', String(isPasswordSelected()))
      _s1.setAttribute('data-state', isPasswordSelected() ? 'active' : 'inactive')
      _s1.setAttribute('tabindex', isPasswordSelected() ? '0' : '-1')
    }
    if (_s3) {
      _s3.setAttribute('data-state', isAccountSelected() ? 'active' : 'inactive')
      if (isAccountSelected()) {
        _s3.classList.remove('hidden')
      } else {
        _s3.classList.add('hidden')
      }
    }
    if (_s4) {
      _s4.setAttribute('data-state', isPasswordSelected() ? 'active' : 'inactive')
      if (isPasswordSelected()) {
        _s4.classList.remove('hidden')
      } else {
        _s4.classList.add('hidden')
      }
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Tabs_s5El] = $c(__scope, 's5')
    if (__Tabs_s5El) {
      const __val = String(activeTab())
      if (__Tabs_s5El.value !== __val) __Tabs_s5El.value = __val
    }
    const [__TabsTrigger_s0El] = $c(__scope, 's0')
    if (__TabsTrigger_s0El) {
      __TabsTrigger_s0El.selected = !!(isAccountSelected())
    }
    const [__TabsTrigger_s1El] = $c(__scope, 's1')
    if (__TabsTrigger_s1El) {
      __TabsTrigger_s1El.selected = !!(isPasswordSelected())
    }
    const [__TabsContent_s3El] = $c(__scope, 's3')
    if (__TabsContent_s3El) {
      __TabsContent_s3El.selected = !!(isAccountSelected())
    }
    const [__TabsContent_s4El] = $c(__scope, 's4')
    if (__TabsContent_s4El) {
      __TabsContent_s4El.selected = !!(isPasswordSelected())
    }
  })

  // Initialize child components with props
  initChild('Tabs', _s5, { get value() { return activeTab() }, onValueChange: setActiveTab })
  initChild('TabsList', _s2, {})
  initChild('TabsTrigger', _s0, { value: "account", get selected() { return isAccountSelected() }, get disabled() { return false }, onClick: () => setActiveTab('account') })
  initChild('TabsTrigger', _s1, { value: "password", get selected() { return isPasswordSelected() }, get disabled() { return false }, onClick: () => setActiveTab('password') })
  initChild('TabsContent', _s3, { value: "account", get selected() { return isAccountSelected() } })
  initChild('TabsContent', _s4, { value: "password", get selected() { return isPasswordSelected() } })
}

hydrate('TabsBasicDemo', { init: initTabsBasicDemo, template: (_p) => `${renderChild('Tabs', {value: ('account'), children: `${renderChild('TabsList', {children: `${renderChild('TabsTrigger', {value: "account", selected: (('account') === 'account'), disabled: false, children: ` Account `}, undefined, 's0')}${renderChild('TabsTrigger', {value: "password", selected: (('account') === 'password'), disabled: false, children: ` Password `}, undefined, 's1')}`}, undefined, 's2')}${renderChild('TabsContent', {value: "account", selected: (('account') === 'account'), children: `<div class="p-4 rounded-lg border bg-background"><h4 class="font-medium mb-2">Account Settings</h4><p class="text-muted-foreground text-sm">Make changes to your account here. Click save when you're done.</p></div>`}, undefined, 's3')}${renderChild('TabsContent', {value: "password", selected: (('account') === 'password'), children: `<div class="p-4 rounded-lg border bg-background"><h4 class="font-medium mb-2">Password Settings</h4><p class="text-muted-foreground text-sm">Change your password here. After saving, you'll be logged out.</p></div>`}, undefined, 's4')}`}, undefined, 's5')}`, comment: true })
export function TabsBasicDemo(_p, __bfKey) { return createComponent('TabsBasicDemo', _p, __bfKey) }
export function initTabsMultipleDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [activeTab, setActiveTab] = createSignal('overview')
  const isOverviewSelected = createMemo(() => activeTab() === 'overview')
  const isAnalyticsSelected = createMemo(() => activeTab() === 'analytics')
  const isReportsSelected = createMemo(() => activeTab() === 'reports')
  const isNotificationsSelected = createMemo(() => activeTab() === 'notifications')

  const [_s9, _s0, _s1, _s2, _s3, _s5, _s6, _s7, _s8, _s4] = $c(__scope, 's9', 's0', 's1', 's2', 's3', 's5', 's6', 's7', 's8', 's4')


  // Reactive prop bindings
  createEffect(() => {
    if (_s9) {
      const __val = String(activeTab())
      if (_s9.value !== __val) _s9.value = __val
    }
    if (_s0) {
      _s0.setAttribute('aria-selected', String(isOverviewSelected()))
      _s0.setAttribute('data-state', isOverviewSelected() ? 'active' : 'inactive')
      _s0.setAttribute('tabindex', isOverviewSelected() ? '0' : '-1')
    }
    if (_s1) {
      _s1.setAttribute('aria-selected', String(isAnalyticsSelected()))
      _s1.setAttribute('data-state', isAnalyticsSelected() ? 'active' : 'inactive')
      _s1.setAttribute('tabindex', isAnalyticsSelected() ? '0' : '-1')
    }
    if (_s2) {
      _s2.setAttribute('aria-selected', String(isReportsSelected()))
      _s2.setAttribute('data-state', isReportsSelected() ? 'active' : 'inactive')
      _s2.setAttribute('tabindex', isReportsSelected() ? '0' : '-1')
    }
    if (_s3) {
      _s3.setAttribute('aria-selected', String(isNotificationsSelected()))
      _s3.setAttribute('data-state', isNotificationsSelected() ? 'active' : 'inactive')
      _s3.setAttribute('tabindex', isNotificationsSelected() ? '0' : '-1')
    }
    if (_s5) {
      _s5.setAttribute('data-state', isOverviewSelected() ? 'active' : 'inactive')
      if (isOverviewSelected()) {
        _s5.classList.remove('hidden')
      } else {
        _s5.classList.add('hidden')
      }
    }
    if (_s6) {
      _s6.setAttribute('data-state', isAnalyticsSelected() ? 'active' : 'inactive')
      if (isAnalyticsSelected()) {
        _s6.classList.remove('hidden')
      } else {
        _s6.classList.add('hidden')
      }
    }
    if (_s7) {
      _s7.setAttribute('data-state', isReportsSelected() ? 'active' : 'inactive')
      if (isReportsSelected()) {
        _s7.classList.remove('hidden')
      } else {
        _s7.classList.add('hidden')
      }
    }
    if (_s8) {
      _s8.setAttribute('data-state', isNotificationsSelected() ? 'active' : 'inactive')
      if (isNotificationsSelected()) {
        _s8.classList.remove('hidden')
      } else {
        _s8.classList.add('hidden')
      }
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Tabs_s9El] = $c(__scope, 's9')
    if (__Tabs_s9El) {
      const __val = String(activeTab())
      if (__Tabs_s9El.value !== __val) __Tabs_s9El.value = __val
    }
    const [__TabsTrigger_s0El] = $c(__scope, 's0')
    if (__TabsTrigger_s0El) {
      __TabsTrigger_s0El.selected = !!(isOverviewSelected())
    }
    const [__TabsTrigger_s1El] = $c(__scope, 's1')
    if (__TabsTrigger_s1El) {
      __TabsTrigger_s1El.selected = !!(isAnalyticsSelected())
    }
    const [__TabsTrigger_s2El] = $c(__scope, 's2')
    if (__TabsTrigger_s2El) {
      __TabsTrigger_s2El.selected = !!(isReportsSelected())
    }
    const [__TabsTrigger_s3El] = $c(__scope, 's3')
    if (__TabsTrigger_s3El) {
      __TabsTrigger_s3El.selected = !!(isNotificationsSelected())
    }
    const [__TabsContent_s5El] = $c(__scope, 's5')
    if (__TabsContent_s5El) {
      __TabsContent_s5El.selected = !!(isOverviewSelected())
    }
    const [__TabsContent_s6El] = $c(__scope, 's6')
    if (__TabsContent_s6El) {
      __TabsContent_s6El.selected = !!(isAnalyticsSelected())
    }
    const [__TabsContent_s7El] = $c(__scope, 's7')
    if (__TabsContent_s7El) {
      __TabsContent_s7El.selected = !!(isReportsSelected())
    }
    const [__TabsContent_s8El] = $c(__scope, 's8')
    if (__TabsContent_s8El) {
      __TabsContent_s8El.selected = !!(isNotificationsSelected())
    }
  })

  // Initialize child components with props
  initChild('Tabs', _s9, { get value() { return activeTab() }, onValueChange: setActiveTab })
  initChild('TabsList', _s4, {})
  initChild('TabsTrigger', _s0, { value: "overview", get selected() { return isOverviewSelected() }, get disabled() { return false }, onClick: () => setActiveTab('overview') })
  initChild('TabsTrigger', _s1, { value: "analytics", get selected() { return isAnalyticsSelected() }, get disabled() { return false }, onClick: () => setActiveTab('analytics') })
  initChild('TabsTrigger', _s2, { value: "reports", get selected() { return isReportsSelected() }, get disabled() { return false }, onClick: () => setActiveTab('reports') })
  initChild('TabsTrigger', _s3, { value: "notifications", get selected() { return isNotificationsSelected() }, get disabled() { return false }, onClick: () => setActiveTab('notifications') })
  initChild('TabsContent', _s5, { value: "overview", get selected() { return isOverviewSelected() } })
  initChild('TabsContent', _s6, { value: "analytics", get selected() { return isAnalyticsSelected() } })
  initChild('TabsContent', _s7, { value: "reports", get selected() { return isReportsSelected() } })
  initChild('TabsContent', _s8, { value: "notifications", get selected() { return isNotificationsSelected() } })
}

hydrate('TabsMultipleDemo', { init: initTabsMultipleDemo, template: (_p) => `${renderChild('Tabs', {value: ('overview'), children: `${renderChild('TabsList', {children: `${renderChild('TabsTrigger', {value: "overview", selected: (('overview') === 'overview'), disabled: false, children: ` Overview `}, undefined, 's0')}${renderChild('TabsTrigger', {value: "analytics", selected: (('overview') === 'analytics'), disabled: false, children: ` Analytics `}, undefined, 's1')}${renderChild('TabsTrigger', {value: "reports", selected: (('overview') === 'reports'), disabled: false, children: ` Reports `}, undefined, 's2')}${renderChild('TabsTrigger', {value: "notifications", selected: (('overview') === 'notifications'), disabled: false, children: ` Notifications `}, undefined, 's3')}`}, undefined, 's4')}${renderChild('TabsContent', {value: "overview", selected: (('overview') === 'overview'), children: `<div class="p-4 rounded-lg border bg-background"><p class="text-muted-foreground">Overview content goes here.</p></div>`}, undefined, 's5')}${renderChild('TabsContent', {value: "analytics", selected: (('overview') === 'analytics'), children: `<div class="p-4 rounded-lg border bg-background"><p class="text-muted-foreground">Analytics content goes here.</p></div>`}, undefined, 's6')}${renderChild('TabsContent', {value: "reports", selected: (('overview') === 'reports'), children: `<div class="p-4 rounded-lg border bg-background"><p class="text-muted-foreground">Reports content goes here.</p></div>`}, undefined, 's7')}${renderChild('TabsContent', {value: "notifications", selected: (('overview') === 'notifications'), children: `<div class="p-4 rounded-lg border bg-background"><p class="text-muted-foreground">Notifications content goes here.</p></div>`}, undefined, 's8')}`}, undefined, 's9')}`, comment: true })
export function TabsMultipleDemo(_p, __bfKey) { return createComponent('TabsMultipleDemo', _p, __bfKey) }
export function initTabsDisabledDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [activeTab, setActiveTab] = createSignal('active')
  const isActiveSelected = createMemo(() => activeTab() === 'active')
  const isAnotherSelected = createMemo(() => activeTab() === 'another')

  const [_s6, _s0, _s2, _s4, _s5, _s3, _s1] = $c(__scope, 's6', 's0', 's2', 's4', 's5', 's3', 's1')


  // Reactive prop bindings
  createEffect(() => {
    if (_s6) {
      const __val = String(activeTab())
      if (_s6.value !== __val) _s6.value = __val
    }
    if (_s0) {
      _s0.setAttribute('aria-selected', String(isActiveSelected()))
      _s0.setAttribute('data-state', isActiveSelected() ? 'active' : 'inactive')
      _s0.setAttribute('tabindex', isActiveSelected() ? '0' : '-1')
    }
    if (_s2) {
      _s2.setAttribute('aria-selected', String(isAnotherSelected()))
      _s2.setAttribute('data-state', isAnotherSelected() ? 'active' : 'inactive')
      _s2.setAttribute('tabindex', isAnotherSelected() ? '0' : '-1')
    }
    if (_s4) {
      _s4.setAttribute('data-state', isActiveSelected() ? 'active' : 'inactive')
      if (isActiveSelected()) {
        _s4.classList.remove('hidden')
      } else {
        _s4.classList.add('hidden')
      }
    }
    if (_s5) {
      _s5.setAttribute('data-state', isAnotherSelected() ? 'active' : 'inactive')
      if (isAnotherSelected()) {
        _s5.classList.remove('hidden')
      } else {
        _s5.classList.add('hidden')
      }
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Tabs_s6El] = $c(__scope, 's6')
    if (__Tabs_s6El) {
      const __val = String(activeTab())
      if (__Tabs_s6El.value !== __val) __Tabs_s6El.value = __val
    }
    const [__TabsTrigger_s0El] = $c(__scope, 's0')
    if (__TabsTrigger_s0El) {
      __TabsTrigger_s0El.selected = !!(isActiveSelected())
    }
    const [__TabsTrigger_s2El] = $c(__scope, 's2')
    if (__TabsTrigger_s2El) {
      __TabsTrigger_s2El.selected = !!(isAnotherSelected())
    }
    const [__TabsContent_s4El] = $c(__scope, 's4')
    if (__TabsContent_s4El) {
      __TabsContent_s4El.selected = !!(isActiveSelected())
    }
    const [__TabsContent_s5El] = $c(__scope, 's5')
    if (__TabsContent_s5El) {
      __TabsContent_s5El.selected = !!(isAnotherSelected())
    }
  })

  // Initialize child components with props
  initChild('Tabs', _s6, { get value() { return activeTab() } })
  initChild('TabsList', _s3, {})
  initChild('TabsTrigger', _s0, { value: "active", get selected() { return isActiveSelected() }, get disabled() { return false }, onClick: () => setActiveTab('active') })
  initChild('TabsTrigger', _s1, { value: "disabled", get selected() { return false }, get disabled() { return true } })
  initChild('TabsTrigger', _s2, { value: "another", get selected() { return isAnotherSelected() }, get disabled() { return false }, onClick: () => setActiveTab('another') })
  initChild('TabsContent', _s4, { value: "active", get selected() { return isActiveSelected() } })
  initChild('TabsContent', _s5, { value: "another", get selected() { return isAnotherSelected() } })
}

hydrate('TabsDisabledDemo', { init: initTabsDisabledDemo, template: (_p) => `${renderChild('Tabs', {value: ('active'), children: `${renderChild('TabsList', {children: `${renderChild('TabsTrigger', {value: "active", selected: (('active') === 'active'), disabled: false, children: ` Active `}, undefined, 's0')}${renderChild('TabsTrigger', {value: "disabled", selected: false, disabled: true, children: ` Disabled `}, undefined, 's1')}${renderChild('TabsTrigger', {value: "another", selected: (('active') === 'another'), disabled: false, children: ` Another `}, undefined, 's2')}`}, undefined, 's3')}${renderChild('TabsContent', {value: "active", selected: (('active') === 'active'), children: `<div class="p-4 rounded-lg border bg-background"><p class="text-muted-foreground">This tab is active.</p></div>`}, undefined, 's4')}${renderChild('TabsContent', {value: "another", selected: (('active') === 'another'), children: `<div class="p-4 rounded-lg border bg-background"><p class="text-muted-foreground">Another active tab.</p></div>`}, undefined, 's5')}`}, undefined, 's6')}`, comment: true })
export function TabsDisabledDemo(_p, __bfKey) { return createComponent('TabsDisabledDemo', _p, __bfKey) }
