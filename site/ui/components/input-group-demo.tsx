"use client"
/**
 * InputGroupDemo Components
 *
 * Interactive demos for InputGroup component.
 * Shows realistic scenarios with addons, prefixes, and suffixes.
 */

import { createSignal } from '@barefootjs/dom'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
} from '@ui/components/ui/input-group'

/**
 * Basic prefix/suffix example
 * Shows text and icon addons in inline positions
 */
export function InputGroupBasicDemo() {
  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="example.com" />
      </InputGroup>

      <InputGroup>
        <InputGroupInput placeholder="Enter amount" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>USD</InputGroupText>
        </InputGroupAddon>
      </InputGroup>

      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="size-4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="Search..." />
      </InputGroup>
    </div>
  )
}

/**
 * With button addon
 * Shows interactive buttons within the input group
 */
export function InputGroupButtonDemo() {
  const [value, setValue] = createSignal('')

  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <InputGroup>
        <InputGroupInput
          placeholder="Enter text to copy..."
          value={value()}
          onInput={(e) => setValue(e.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={() => {
              if (value()) navigator.clipboard.writeText(value())
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="size-3.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            Copy
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      <InputGroup>
        <InputGroupAddon>
          <InputGroupButton size="icon-xs">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="size-4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </InputGroupButton>
        </InputGroupAddon>
        <InputGroupInput placeholder="Username" />
      </InputGroup>
    </div>
  )
}

/**
 * Password input with visibility toggle
 * Realistic form pattern for password fields
 */
export function InputGroupPasswordDemo() {
  const [visible, setVisible] = createSignal(false)

  return (
    <div className="max-w-sm">
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="size-4"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          type={visible() ? 'text' : 'password'}
          placeholder="Enter password"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            onClick={() => setVisible(v => !v)}
            aria-label={visible() ? 'Hide password' : 'Show password'}
          >
            {visible()
              ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="size-4"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" x2="23" y1="1" y2="23"/></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="size-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            }
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
