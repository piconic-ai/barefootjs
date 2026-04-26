---
title: Writing a Custom Adapter
description: Step-by-step guide to building a custom adapter using the TestAdapter as a reference.
---

# Writing a Custom Adapter

Build a custom adapter using the `TestAdapter` (`packages/jsx/src/adapters/test-adapter.ts`) as reference — a minimal working adapter that generates JSX output.


## Step 1: Implement `TemplateAdapter`

Extend `BaseAdapter` or implement `TemplateAdapter` directly:

```typescript
import type {
  ComponentIR,
  IRNode,
  IRElement,
  IRText,
  IRExpression,
  IRConditional,
  IRLoop,
  IRComponent,
  IRFragment,
  ParamInfo,
} from '../types'
import { type AdapterOutput, BaseAdapter } from './interface'

export class TestAdapter extends BaseAdapter {
  name = 'test'
  extension = '.test.tsx'

  private componentName: string = ''

  generate(ir: ComponentIR): AdapterOutput {
    this.componentName = ir.metadata.componentName

    const imports = this.generateImports(ir)
    const types = this.generateTypes(ir)
    const component = this.generateComponent(ir)

    const template = [imports, types, component].filter(Boolean).join('\n\n')

    return {
      template,
      types: types || undefined,
      extension: this.extension,
    }
  }

  // ... node rendering methods (see below)
}
```

## Step 2: Implement `renderNode()`

Route each IR node to the correct rendering method:

```typescript
renderNode(node: IRNode): string {
  switch (node.type) {
    case 'element':     return this.renderElement(node)
    case 'text':        return (node as IRText).value
    case 'expression':  return this.renderExpression(node)
    case 'conditional': return this.renderConditional(node)
    case 'loop':        return this.renderLoop(node)
    case 'component':   return this.renderComponent(node)
    case 'fragment':    return this.renderChildren((node as IRFragment).children)
    case 'slot':        return '{children}'
    default:            return ''
  }
}
```

## Step 3: Implement Element Rendering

Render the tag, attributes, hydration markers, and children:

```typescript
renderElement(element: IRElement): string {
  const tag = element.tag
  const attrs = this.renderAttributes(element)
  const children = this.renderChildren(element.children)

  let hydrationAttrs = ''
  if (element.needsScope) {
    hydrationAttrs += ' bf-s={__scopeId}'
  }
  if (element.slotId) {
    hydrationAttrs += ` bf="${element.slotId}"`
  }

  if (children) {
    return `<${tag}${attrs}${hydrationAttrs}>${children}</${tag}>`
  } else {
    return `<${tag}${attrs}${hydrationAttrs} />`
  }
}
```

### Attributes

```typescript
private renderAttributes(element: IRElement): string {
  const parts: string[] = []

  for (const attr of element.attrs) {
    const attrName = attr.name === 'class' ? 'className' : attr.name

    if (attr.name === '...') {
      parts.push(`{...${attr.value}}`)
    } else if (attr.value === null) {
      parts.push(attrName)           // Boolean attribute
    } else if (attr.dynamic) {
      parts.push(`${attrName}={${attr.value}}`)
    } else {
      parts.push(`${attrName}="${attr.value}"`)
    }
  }

  // Event handlers — render as no-op stubs for SSR
  for (const event of element.events) {
    const handlerName = `on${event.name.charAt(0).toUpperCase()}${event.name.slice(1)}`
    parts.push(`${handlerName}={() => {}}`)
  }

  return parts.length > 0 ? ' ' + parts.join(' ') : ''
}
```

The TestAdapter renders event handlers as no-op stubs for JSX. Non-JSX adapters omit them — handlers exist only in client JS.


## Step 4: Implement Expression Rendering

Reactive expressions with a `slotId` get a hydration marker for client JS updates:

```typescript
renderExpression(expr: IRExpression): string {
  if (expr.expr === 'null' || expr.expr === 'undefined') {
    return 'null'
  }
  if (expr.reactive && expr.slotId) {
    return `<span bf="${expr.slotId}">{${expr.expr}}</span>`
  }
  return `{${expr.expr}}`
}
```

Non-JSX adapters convert expressions to the target language (e.g., `count()` → `{{.Count}}`).


## Step 5: Implement Conditional Rendering

Ternaries pass through in JSX adapters:

```typescript
renderConditional(cond: IRConditional): string {
  const whenTrue = this.renderNode(cond.whenTrue)
  const whenFalse = this.renderNode(cond.whenFalse)

  return `{${cond.condition} ? ${whenTrue} : ${whenFalse || 'null'}}`
}
```

**Input (JSX):**
```tsx
{isActive ? <span>Active</span> : <span>Inactive</span>}
```

**Output (TestAdapter):**
```tsx
{isActive ? <span>Active</span> : <span>Inactive</span>}
```

Non-JSX adapters translate to the target conditional syntax (e.g., `{{if .IsActive}}...{{else}}...{{end}}`).


## Step 6: Implement Loop Rendering

`.map()` calls stay as JSX:

```typescript
renderLoop(loop: IRLoop): string {
  const indexParam = loop.index ? `, ${loop.index}` : ''
  const children = this.renderChildren(loop.children)

  return `{${loop.array}.map((${loop.param}${indexParam}) => ${children})}`
}
```

**Input (JSX):**
```tsx
{items.map(item => <li>{item.name}</li>)}
```

**Output (TestAdapter):**
```tsx
{items.map((item) => <li>{item.name}</li>)}
```

Non-JSX adapters translate to the target iteration syntax (e.g., `{{range .Items}}...{{end}}`).


## Step 7: Implement Component Rendering

Pass the parent's scope ID to nested components:

```typescript
renderComponent(comp: IRComponent): string {
  const props = this.renderComponentProps(comp)
  const children = this.renderChildren(comp.children)

  const scopeAttr = ' __bfScope={__scopeId}'

  if (children) {
    return `<${comp.name}${props}${scopeAttr}>${children}</${comp.name}>`
  } else {
    return `<${comp.name}${props}${scopeAttr} />`
  }
}
```

## Step 8: Implement Hydration Markers

```typescript
renderScopeMarker(instanceIdExpr: string): string {
  return `bf-s={${instanceIdExpr}}`
}

renderSlotMarker(slotId: string): string {
  return `bf="${slotId}"`
}

renderCondMarker(condId: string): string {
  return `bf-c="${condId}"`
}
```

## Step 9: Generate Signal Initializers

Signal getters return initial values during SSR via stub functions:

```typescript
private generateSignalInitializers(ir: ComponentIR): string {
  const lines: string[] = []

  for (const signal of ir.metadata.signals) {
    lines.push(`  const ${signal.getter} = () => ${signal.initialValue}`)
    lines.push(`  const ${signal.setter} = () => {}`)
  }

  for (const memo of ir.metadata.memos) {
    lines.push(`  const ${memo.name} = ${memo.computation}`)
  }

  return lines.join('\n')
}
```

`const [count, setCount] = createSignal(initial)` becomes:
```typescript
const count = () => initial   // getter returns initial value
const setCount = () => {}     // setter is a no-op on the server
```

## Optional: Type Generation

For typed backends, implement `generateTypes()`:

```typescript
generateTypes(ir: ComponentIR): string | null {
  const lines: string[] = []

  const propsTypeName = ir.metadata.propsType?.raw
  if (propsTypeName) {
    lines.push(`type ${this.componentName}PropsWithHydration = ${propsTypeName} & {`)
    lines.push('  __instanceId?: string')
    lines.push('  __bfScope?: string')
    lines.push('}')
  }

  return lines.length > 0 ? lines.join('\n') : null
}
```

For dynamically-typed backends, return `null`.


## Testing

```typescript
import { compileJsxToIR } from '@barefootjs/jsx'
import { TestAdapter } from './test-adapter'

const source = `
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
`

const ir = compileJsxToIR(source)
const adapter = new TestAdapter()
const output = adapter.generate(ir)

console.log(output.template)
// export function Counter({ __instanceId, ... }) {
//   const __scopeId = ...
//   const count = () => 0
//
//   return (
//     <div bf-s={__scopeId}>
//       <span bf="s1">Count: {bfText("s0")}{count()}{bfTextEnd()}</span>
//       <button bf="s2" onClick={() => {}}>+1</button>
//     </div>
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

### Reference Implementations

- **TestAdapter** (`packages/jsx/src/adapters/test-adapter.ts`) — Minimal working adapter used throughout this guide
- **HonoAdapter** (`packages/adapter-hono/src/adapter/hono-adapter.ts`) — Production JSX-to-JSX adapter with script collection via Hono's request context
- **GoTemplateAdapter** (`packages/adapter-go-template/src/adapter/go-template-adapter.ts`) — Production adapter with expression translation, type generation, and array method mapping
