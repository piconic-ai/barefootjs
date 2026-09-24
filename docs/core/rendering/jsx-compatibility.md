---
title: JSX Compatibility
description: Standard JSX control flow, lists, events, attributes, and fragments in BarefootJS, and the expressions template-language adapters refuse.
---

# JSX Compatibility

Standard JSX works. Components run once — there is no re-render — so read signals inside JSX (`count()`) and the compiler wires each read to a patchable slot.

## Control flow

```tsx
// Ternary
{count() > 0 ? <p>{count()} items</p> : <p>No items</p>}

// Logical AND
{isLoggedIn() && <Dashboard />}
```

## List rendering

Every `.map()` row needs a `key`. `.filter()`, `.sort()`, and `.toSorted()` chain before it; a block-body predicate or comparator works when the body produces a value (see [Adapter limits](#adapter-limits)).

```tsx
{todos().map(todo => (
  <TodoItem key={todo.id} todo={todo} />
))}
```

```tsx
// Filter with a block-body predicate
{todos().filter(t => {
  const f = filter()
  if (f === 'active') return !t.done
  if (f === 'completed') return t.done
  return true
}).map(todo => (
  <TodoItem key={todo.id} todo={todo} />
))}

// Sort by price, break ties by name
{items().sort((a, b) => a.price - b.price || a.name.localeCompare(b.name)).map(item => (
  <Item key={item.id} item={item} />
))}
```

## Event handling

```tsx
<button onClick={() => setCount(n => n + 1)}>+1</button>
<input onInput={(e) => setText((e.target as HTMLInputElement).value)} />
<input onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
```

## Dynamic attributes

```tsx
<button disabled={!accepted()}>Submit</button>
<a className={filter() === 'all' ? 'selected' : ''}>All</a>
<div style={`background: ${accepted() ? '#4caf50' : '#ccc'}`}>Status</div>
```

## Fragments

`<>…</>` works, and a component may return one. No wrapper element is emitted — the children land directly in the parent, and `<>{props.children}</>` is passed through as if the fragment were not there. In a `"use client"` component with several `return`s, a branch that returns a bare fragment is refused with [BF029](../advanced/error-codes.md#bf029); wrap that branch in an element.

```tsx
<>
  <h1>Title</h1>
  <p>Description</p>
</>
```

## Adapter limits

JS-runtime adapters (Hono, CSR) execute any callback at SSR, so everything above compiles there. Template-language adapters (Go, Mojolicious, Xslate, ERB, Jinja, Twig, Blade, minijinja, Pebble) lower a defined subset into their template grammar and refuse the rest loudly:

- **BF021** — an unsupported predicate or comparator *shape*: a genuinely imperative block body (one that reassigns a local, loops, or `break`s — a value-producing block normalizes and lowers everywhere), `typeof`, a comparator referenced from an import or through an alias.
- **BF101** — an expression with no lowering at all: `.reduce()`, `.forEach()`, a nested `.some()`/`.find()` inside a predicate, a loop over a component-scope `const` computed at render time, a destructured predicate parameter (`({ done }) => done`), or a `function`-keyword callback.

Both are escapable with [`/* @client */`](./client-directive.md), which renders nothing for that region until hydration. When the value can be computed server-side, pass it as a prop instead — that keeps SSR.

```tsx
// ❌ BF101 on Go/Mojo; works on Hono
type Props = { reactions: Record<string, string[]> }
function ReactionBar(props: Props) {
  const entries = Object.entries(props.reactions).filter(([, users]) => users.length > 0)
  return <div>{entries.map(([emoji, users]) => (
    <span key={emoji}>{emoji}: {String(users.length)}</span>
  ))}</div>
}

// ✅ Pass the array as a prop — keeps SSR
type Entry = [string, string[]]
function ReactionBarByProp({ entries }: { entries: Entry[] }) {
  return <div>{entries.map(([emoji, users]) => (
    <span key={emoji}>{emoji}: {String(users.length)}</span>
  ))}</div>
}
```

```tsx
// ❌ BF101 on Go/Mojo; works on Hono
{items().filter(x => x.tags.some(t => t.active)).map(t => t.name)}

// ✅ Defer to the client — empty until hydration
{/* @client */ items().filter(x => x.tags.some(t => t.active)).map(t => t.name)}
```

Per-adapter table: [compatibility matrix](/docs/advanced/compatibility-matrix). Diagnostics and fixes: [Error Codes](../advanced/error-codes.md).
