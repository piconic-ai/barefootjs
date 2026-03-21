"use client"
/**
 * ButtonGroupDemo Components
 *
 * Interactive demos for ButtonGroup component.
 * Each demo shows a realistic usage scenario.
 */

import { createSignal } from '@barefootjs/dom'
import { Button } from '@ui/components/ui/button'
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from '@ui/components/ui/button-group'

/**
 * Basic horizontal button group
 */
export function ButtonGroupBasicDemo() {
  const [active, setActive] = createSignal('inbox')

  return (
    <div className="space-y-4">
      <ButtonGroup>
        <Button
          variant={active() === 'inbox' ? 'default' : 'outline'}
          onClick={() => setActive('inbox')}
        >
          Inbox
        </Button>
        <Button
          variant={active() === 'drafts' ? 'default' : 'outline'}
          onClick={() => setActive('drafts')}
        >
          Drafts
        </Button>
        <Button
          variant={active() === 'sent' ? 'default' : 'outline'}
          onClick={() => setActive('sent')}
        >
          Sent
        </Button>
      </ButtonGroup>
      <p data-testid="active-view" className="text-sm text-muted-foreground">
        Viewing: {active()}
      </p>
    </div>
  )
}

/**
 * Button group with separator — split button pattern
 */
export function ButtonGroupSeparatorDemo() {
  const [saved, setSaved] = createSignal(false)

  return (
    <ButtonGroup>
      <Button variant="outline" onClick={() => setSaved(true)}>
        {saved() ? 'Saved!' : 'Save'}
      </Button>
      <ButtonGroupSeparator />
      <Button variant="outline" size="icon" aria-label="More save options">
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </Button>
    </ButtonGroup>
  )
}

/**
 * Vertical orientation example
 */
export function ButtonGroupVerticalDemo() {
  return (
    <ButtonGroup orientation="vertical">
      <Button variant="outline">Profile</Button>
      <Button variant="outline">Settings</Button>
      <Button variant="outline">Logout</Button>
    </ButtonGroup>
  )
}

/**
 * Button group with text label
 */
export function ButtonGroupTextDemo() {
  const [count, setCount] = createSignal(1)

  return (
    <ButtonGroup>
      <Button variant="outline" size="icon" onClick={() => setCount(n => Math.max(0, n - 1))} aria-label="Decrease">
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4" />
        </svg>
      </Button>
      <ButtonGroupText>
        <span data-testid="quantity">{count()}</span>
      </ButtonGroupText>
      <Button variant="outline" size="icon" onClick={() => setCount(n => n + 1)} aria-label="Increase">
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </Button>
    </ButtonGroup>
  )
}
