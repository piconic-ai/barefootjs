"use client"
/**
 * RadioGroupDemo Components
 *
 * Interactive demos for RadioGroup component.
 * Based on shadcn/ui patterns for practical use cases.
 */

import { createSignal, createMemo } from '@barefootjs/client'
import { RadioGroup, RadioGroupItem } from '@ui/components/ui/radio-group'

/**
 * Basic radio group example
 * Shows simple usage with display density options and selected value display
 */
export function RadioGroupBasicDemo() {
  const [density, setDensity] = createSignal('default')

  return (
    <div className="space-y-4">
      <RadioGroup defaultValue="default" onValueChange={setDensity}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="default" defaultChecked />
          <span className="text-sm font-medium leading-none">Default</span>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="comfortable" />
          <span className="text-sm font-medium leading-none">Comfortable</span>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="compact" />
          <span className="text-sm font-medium leading-none">Compact</span>
        </div>
      </RadioGroup>
      <div className="text-sm text-muted-foreground pt-2 border-t">
        Selected: {density()}
      </div>
    </div>
  )
}

/**
 * Form example with multiple radio groups
 * Notification settings pattern with two independent RadioGroups
 */
export function RadioGroupFormDemo() {
  const [notifyType, setNotifyType] = createSignal('all')
  const [theme, setTheme] = createSignal('system')

  const summary = createMemo(() =>
    `Notifications: ${notifyType()}, Theme: ${theme()}`
  )

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h4 className="text-sm font-medium leading-none">Notify me about...</h4>
        <RadioGroup defaultValue="all" onValueChange={setNotifyType}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" defaultChecked />
            <span className="text-sm leading-none">All new messages</span>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="mentions" />
            <span className="text-sm leading-none">Direct messages and mentions</span>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="none" />
            <span className="text-sm leading-none">Nothing</span>
          </div>
        </RadioGroup>
      </div>
      <div className="space-y-3">
        <h4 className="text-sm font-medium leading-none">Theme</h4>
        <RadioGroup defaultValue="system" onValueChange={setTheme}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="light" />
            <span className="text-sm leading-none">Light</span>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="dark" />
            <span className="text-sm leading-none">Dark</span>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="system" defaultChecked />
            <span className="text-sm leading-none">System</span>
          </div>
        </RadioGroup>
      </div>
      <div className="text-sm text-muted-foreground pt-2 border-t">
        {summary()}
      </div>
    </div>
  )
}

/**
 * Card-style radio group
 * Plan selection pattern with rich card options
 */
export function RadioGroupCardDemo() {
  const [plan, setPlan] = createSignal('startup')

  return (
    <div className="space-y-4">
      <RadioGroup defaultValue="startup" onValueChange={setPlan} className="grid-cols-1 sm:grid-cols-3">
        <div className="relative">
          <label className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50 cursor-pointer">
            <RadioGroupItem value="startup" defaultChecked />
            <div className="space-y-1">
              <span className="text-sm font-medium leading-none">Startup</span>
              <p className="text-xl font-bold text-foreground">$29<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <p className="text-sm text-muted-foreground">For small teams getting started</p>
            </div>
          </label>
        </div>
        <div className="relative">
          <label className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50 cursor-pointer">
            <RadioGroupItem value="business" />
            <div className="space-y-1">
              <span className="text-sm font-medium leading-none">Business</span>
              <p className="text-xl font-bold text-foreground">$99<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <p className="text-sm text-muted-foreground">For growing companies</p>
            </div>
          </label>
        </div>
        <div className="relative">
          <label className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50 cursor-pointer">
            <RadioGroupItem value="enterprise" />
            <div className="space-y-1">
              <span className="text-sm font-medium leading-none">Enterprise</span>
              <p className="text-xl font-bold text-foreground">$299<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <p className="text-sm text-muted-foreground">For large organizations</p>
            </div>
          </label>
        </div>
      </RadioGroup>
      <div className="text-sm text-muted-foreground pt-2 border-t">
        Selected plan: {plan()}
      </div>
    </div>
  )
}
