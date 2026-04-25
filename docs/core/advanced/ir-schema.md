---
title: IR Schema Reference
description: JSON tree structure of the Intermediate Representation consumed by adapters and client-JS generation.
---

# IR Schema Reference

The IR is a JSON tree between JSX parsing and output generation. Adapters consume IR without knowledge of the original JSX syntax.

## Pipeline Position

```
JSX Source → [Phase 1: analyzer + jsx-to-ir] → IR → [Phase 2a: adapter] → Template
                                                   → [Phase 2b: ir-to-client-js] → Client JS
```

## Node Types

Defined in [`packages/jsx/src/types.ts`](../../../packages/jsx/src/types.ts):

| Type | Description |
|------|-------------|
| `IRElement` | HTML/SVG element |
| `IRText` | Static text |
| `IRExpression` | Dynamic expression (`{braces}`) |
| `IRConditional` | Branching via ternary or logical expressions |
| `IRLoop` | List rendering via `.map()` (including filter/sort) |
| `IRComponent` | Child component reference |
| `IRFragment` | JSX fragment (`<>...</>`) |
| `IRIfStatement` | Early return within a component body |
| `IRProvider` | Context Provider |

---

## Hydration Markers

`slotId` and `needsScope` map to HTML attributes:

| IR Field | HTML Output | Purpose |
|----------|------------|---------|
| `needsScope: true` | `bf-s="ComponentName"` | Component root boundary |
| `slotId: "0"` | `bf="0"` | Reference for interactive elements |
| Conditional `slotId` | `bf-c="1"` | Anchor for conditional branches |


---

## Debugging

Pass `outputIR: true` to inspect the IR:

```typescript
import { compileJSXSync } from '@barefootjs/jsx'

const result = compileJSXSync(source, 'Counter.tsx', {
  adapter: new HonoAdapter(),
  outputIR: true,
})

// result.ir contains the full ComponentIR
console.log(JSON.stringify(result.ir, null, 2))

// result.additionalFiles includes the *.ir.json file
// e.g., { path: 'Counter.ir.json', content: '...' }
```
