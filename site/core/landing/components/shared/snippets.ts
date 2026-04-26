/**
 * Code snippets for Hero section demo
 * Embedded as module to avoid fetch() in Workers environment
 */

export const SOURCE_CODE = `"use client"

import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count()}
    </button>
  )
}`

export const HONO_OUTPUT = `// Hono JSX Template
export function Counter({ count = 0 }) {
  return (
    <button bf-s="Counter" bf="slot_1">
      Count: <span bf="slot_0">{count}</span>
    </button>
  )
}`

export const ECHO_OUTPUT = `{{/* Go html/template */}}
<button bf-s="Counter" bf="slot_1">
  Count: <span bf="slot_0">{{ .Count }}</span>
</button>`

export const MOJO_OUTPUT = `% # Mojolicious template
<button bf-s="Counter" bf="slot_1">
  Count: <span bf="slot_0"><%= $count %></span>
</button>`

export const BROWSER_OUTPUT = `<!-- Rendered & hydrated in the browser -->
<button bf-s="Counter" bf="slot_1">
  Count: <span bf="slot_0">0</span>
</button>`

export const CLIENT_CODE = `// Counter.client.js
import { createSignal, createEffect, find, hydrate } from '@barefootjs/client'

export function initCounter(__scope, props = {}) {
  const [count, setCount] = createSignal(props.count ?? 0)

  const _slot_0 = find(__scope, '[bf="slot_0"]')
  const _slot_1 = find(__scope, '[bf="slot_1"]')

  createEffect(() => {
    if (_slot_0) _slot_0.textContent = String(count())
  })

  if (_slot_1) _slot_1.onclick = () => setCount(c => c + 1)
}

hydrate('Counter', { init: initCounter })`
