import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Client component whose root is a child-component call',
  given: "a `'use client'` component whose entire JSX return is a single child-component call (no wrapping element), with its own state or handlers (e.g. buttons forwarded as the child's `children`)",
  expected: "the server HTML wraps the child's output in the parent's `<!--bf-scope:...-->` / `<!--bf-/scope:...-->` comment pair carrying the parent's props, so the parent hydrates and its handlers and reactive props reach the child",
  actual: "omits the parent's scope comment pair and renders only the child's output, with no diagnostic, so the parent never hydrates on the client: its forwarded handlers do nothing and the child's prop never updates",
  fixtures: ['component-root-client-scope'],
})
