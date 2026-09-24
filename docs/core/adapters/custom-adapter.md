---
title: Writing a Custom Adapter
description: How adapters turn the compiler's IR into a marked template, and how to build one from the TestAdapter.
---

# Writing a Custom Adapter

An adapter converts the compiler's IR into a template format your server can render, so the same JSX runs on a backend BarefootJS does not ship.

## Role

Phase 1 parses JSX into a backend-agnostic `ComponentIR`. Phase 2a hands that IR to the adapter, which walks each node and emits the target template language with hydration markers (`bf-*` attributes). Phase 2b generates the client JS from the same IR with no adapter involved, so an adapter only decides how the server side is spelled. The node types are documented in [`spec/compiler.md`](https://github.com/piconic-ai/barefootjs/blob/main/spec/compiler.md#ir-schema).

## The `TemplateAdapter` interface

Import it from `@barefootjs/jsx`. `BaseAdapter` implements it with a `renderChildren()` helper; extending it is optional.

| Member | Purpose |
|--------|---------|
| `name`, `extension` | Adapter id (`'go-template'`) and output file extension (`'.tmpl'`) |
| `generate(ir, options?)` | Entry point. Returns `{ template, sections, types?, extension }` |
| `renderNode(node)` | Dispatcher — routes to the method for the node's `type` |
| `renderElement(element)` | HTML element with attributes, events, children, and markers |
| `renderExpression(expr)` | Dynamic expression (`{count()}`, `{props.name}`) |
| `renderConditional(cond)` | Ternaries and `&&`/`\|\|` expressions |
| `renderLoop(loop)` | `.map()` and `.filter()`/`.sort()` chains |
| `renderComponent(comp)` | Nested component invocation, passing the parent scope |
| `renderAsync(node)` | Async boundary with fallback |
| `renderScopeMarker(instanceIdExpr)` | `bf-s` — component boundary |
| `renderSlotMarker(slotId)` | `bf` — element the client JS targets |
| `renderCondMarker(condId)` | `bf-c` — conditional block for DOM switching |
| `generateTypes?(ir)` | Type definitions for typed backends; return `null` otherwise |

`renderNode` handles text, fragment and slot nodes inline. Non-JS backends also translate expressions into the target language (`count()` → `{{.Count}}`) and omit event handlers, which exist only in client JS.

## Start from TestAdapter

`packages/jsx/src/adapters/test-adapter.ts` is the smallest working adapter: it emits JSX, renders event handlers as no-op stubs, and turns each signal into a server stub (`const count = () => initial`, `const setCount = () => {}`) so the template renders initial values. Copy it and replace the JSX spellings method by method.

## Testing

Compile a component through your adapter and inspect the template:

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = createSignal(initial)
  return (
    <div>
      <p>{count()}</p>
      <button onClick={() => setCount(n => n + 1)}>+1</button>
    </div>
  )
}
```

```typescript
import { compileJSX } from '@barefootjs/jsx'
import { TestAdapter } from './test-adapter'

const result = compileJSX(source, 'Counter.tsx', { adapter: new TestAdapter() })
console.log(result.files.find(f => f.type === 'markedTemplate')?.content)
// export function Counter({ initial = 0, __instanceId, __bfScope }: CounterPropsWithHydration = ...) {
//   const __scopeId = ... || `Counter_${Math.random().toString(36).slice(2, 8)}`
//   const count = () => initial
//   return (
//     <div bf-s={__scopeId}><p bf="s1">{bfText("s0")}{count()}{bfTextEnd()}</p><button onClick={() => {}} bf="s2">+1</button></div>
//   )
// }
```

## Checklist

Ensure you handle:

- [ ] All IR node types (`element`, `text`, `expression`, `conditional`, `loop`, `component`, `fragment`, `slot`)
- [ ] Hydration markers (`bf-s`, `bf`, `bf-c`) on interactive elements
- [ ] Static vs. dynamic attributes
- [ ] Boolean HTML attributes (`disabled`, `checked`, etc.)
- [ ] Spread attributes (`{...props}`)
- [ ] Signal getter stubs for server-side initial values
- [ ] Nested component scope passing
- [ ] Props serialization (`bf-p` attribute) for client hydration
- [ ] Script registration for client JS loading
- [ ] `/* @client */` directive (skip client-only expressions server-side)

Production adapters also handle:

- [ ] Void HTML elements (`<input>`, `<br>`, etc.) — no closing tag
- [ ] Expression translation to the target template language
- [ ] Type generation for typed backend languages
- [ ] `if-statement` and `provider` IR node types

## Conformance

The fixtures under `packages/adapter-tests/fixtures/` are the acceptance gate: each compiles a component through every adapter and compares the rendered HTML. Every fixture's `expectedHtml` is generated from the Hono reference adapter, so Hono's output is the contract a new adapter is measured against. The helpers a template may call are specified in [`spec/template-helpers.md`](https://github.com/piconic-ai/barefootjs/blob/main/spec/template-helpers.md); the package layering rules are in [`spec/adapter-architecture.md`](https://github.com/piconic-ai/barefootjs/blob/main/spec/adapter-architecture.md).

Production references: `HonoAdapter` (`packages/adapter-hono/src/adapter/hono-adapter.ts`) and `GoTemplateAdapter` (`packages/adapter-go-template/src/adapter/go-template-adapter.ts`, with expression translation and type generation).
