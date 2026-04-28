"use client"

// JSX infra smoke component for the @barefootjs/xyflow package.
//
// This file is the proof that the package's tsconfig accepts JSX with
// `@barefootjs/jsx` as the JSX import source — see #1081 step 1.
// It is not exported from `src/index.ts`; it exists only so `jsx-smoke.test.ts`
// can feed it through `renderToTest()` and assert the JSX → IR pipeline
// accepts a "use client" component declared inside this package.
//
// Real renderer migrations (Flow, Background, MiniMap, Controls, Handle,
// Edge, NodeWrapper) land in subsequent steps of #1081.

import { createSignal } from '@barefootjs/client'

export function JsxSmoke() {
  const [count, setCount] = createSignal(0)
  return (
    <button type="button" onClick={() => setCount(count() + 1)}>
      count: {count()}
    </button>
  )
}
