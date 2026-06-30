---
title: JSX Compatibility
description: Standard JSX syntax support in BarefootJS, including control flow and common patterns from React and SolidJS.
---

# JSX Compatibility

Standard JSX syntax works. This page covers BarefootJS-specific behavior and limitations.


## Control Flow

```tsx
// Ternary
{count() > 0 ? <p>{count()} items</p> : <p>No items</p>}

// Logical AND
{isLoggedIn() && <Dashboard />}

// Conditional return
if (status === 'empty') {
  return <p>No items yet.</p>
}
return <div>...</div>
```


## List Rendering

```tsx
{todos().map(todo => (
  <TodoItem key={todo.id} todo={todo} />
))}
```

`.filter().map()` chains work when the predicate uses simple expressions or block bodies with `if`/`return`:

```tsx
// ✅ Simple predicate
{todos().filter(t => !t.done).map(todo => (
  <TodoItem key={todo.id} todo={todo} />
))}

// ✅ Block body with simple statements — also works
{todos().filter(t => {
  const f = filter()
  if (f === 'active') return !t.done
  if (f === 'completed') return t.done
  return true
}).map(todo => (
  <TodoItem key={todo.id} todo={todo} />
))}
```

`.sort()` and `.toSorted()` can be chained with `.map()` and `.filter()`:

```tsx
// ✅ Sort then render
{items().sort((a, b) => a.price - b.price).map(item => (
  <Item key={item.id} item={item} />
))}

// ✅ Filter, sort, then render
{items().filter(x => x.active).sort((a, b) => a.name.localeCompare(b.name)).map(item => (
  <Item key={item.id} item={item} />
))}

// ✅ Multi-key: sort by price, break ties by name
{items().sort((a, b) => a.price - b.price || a.name.localeCompare(b.name)).map(item => (
  <Item key={item.id} item={item} />
))}

// ✅ Relational ternary
{items().toSorted((a, b) => a.price > b.price ? 1 : -1).map(item => (
  <Item key={item.id} item={item} />
))}
```

Supported comparator shapes: `(a, b) => a - b`, `(a, b) => a.field - b.field`, `(a, b) => a.localeCompare(b)`, `(a, b) => a.field.localeCompare(b.field)`, relational-ternary returns (`(a, b) => a.field > b.field ? 1 : -1`, including the 3-way `a < b ? -1 : a > b ? 1 : 0` form), and any of these `||`-chained for multi-key tie-breaks. A single-`return` block body (`(a, b) => { return a.field - b.field }`) works too. Reverse the operands (or the ternary sign) for descending order. Other shapes — function references (`sort(myCmp)`), multi-statement block bodies, and `localeCompare(b, locale, opts)` — produce a compile error; use `/* @client */` in that case.


## Event Handling

```tsx
<button onClick={() => setCount(n => n + 1)}>+1</button>
<input onInput={(e) => setText((e.target as HTMLInputElement).value)} />
<input onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
```


## Dynamic Attributes

```tsx
<button disabled={!accepted()}>Submit</button>
<a className={filter() === 'all' ? 'selected' : ''}>All</a>
<div style={`background: ${accepted() ? '#4caf50' : '#ccc'}`}>...</div>
```


## Limitations

Some JavaScript expressions cannot be translated into marked template syntax. Which expressions error depends on the adapter — non-JS template backends (Go `html/template`, Mojolicious EP) have a narrower expression surface than JS-runtime adapters (Hono, etc.) that can execute JS at SSR time.

| Pattern | Hono / JS-runtime adapters | Go / Mojo adapters |
|---|---|---|
| `.filter()` with destructured param (`({done}) => done`) | works (runs as JS) | **BF101** |
| `.filter()` with `function` keyword callback | works | **BF101** |
| `.reduce()`, `.forEach()`, `.flatMap()` | works | **BF101** |
| Nested higher-order in filter predicate (`x => x.tags.filter(...).length > 0`) | works | **BF101** |
| Sort comparator that's a function reference, multi-statement block body, or `localeCompare(b, locale, opts)` | **BF021** (all adapters) | **BF021** |
| `typeof` in a filter predicate | **BF021** (all adapters) | **BF021** |

`BF021` is raised at the IR layer and applies to every adapter. `BF101` is raised by adapters that can't lower the expression to their template language. Either way, add [`/* @client */`](./client-directive.md) to opt into client-only evaluation and suppress the error.

### Patterns that error on Go / Mojo

**Nested higher-order methods:**

```tsx
// ❌ BF101 on Go/Mojo; works on Hono
{items().filter(x => x.tags.filter(t => t.active).length > 0).map(...)}

// ✅ Add /* @client */ to evaluate on the client
{/* @client */ items().filter(x => x.tags.filter(t => t.active).length > 0).map(...)}
```

**`.reduce()` / `.forEach()` / `.flatMap()`:**

```tsx
// ❌ BF101 on Go/Mojo; works on Hono
{items().reduce((sum, x) => sum + x.price, 0)}

// ✅ Use /* @client */
{/* @client */ items().reduce((sum, x) => sum + x.price, 0)}
```

**Destructuring in predicate parameters:**

```tsx
// ❌ BF101 on Go/Mojo; works on Hono
{items().filter(({done}) => done).map(...)}

// ✅ Use a named parameter for adapter portability
{items().filter(t => t.done).map(...)}
```

**Function expressions** (`function` keyword):

```tsx
// ❌ BF101 on Go/Mojo; works on Hono
{items().filter(function(x) { return x.done })}

// ✅ Use arrow functions for adapter portability
{items().filter(x => x.done)}
```

### Patterns that error on all adapters

**Unsupported sort comparators** (imperative block bodies, function references):

A value-producing block body normalizes to an expression — pure `const`
bindings inline (let-inline) and a value-producing `if` / early `return`
becomes a ternary — so it lowers on all adapters just like the expression form:

```tsx
// ✅ Value-producing block bodies normalize (let-inline) and lower everywhere
{items().sort((a, b) => { const an = a.name; return an > b.name ? 1 : -1 }).map(item => (
  <Item key={item.id} item={item} />
))}
```

Only a genuinely imperative comparator — one that re-assigns a local, loops, or
`break`s — has no value-position lowering and errors:

```tsx
// ❌ BF021 (all adapters)
{items().sort((a, b) => { let r = 0; r = a.name > b.name ? 1 : -1; return r }).map(item => (
  <Item key={item.id} item={item} />
))}

// ✅ Use /* @client */
{/* @client */ items().sort((a, b) => { let r = 0; r = a.name > b.name ? 1 : -1; return r }).map(item => (
  <Item key={item.id} item={item} />
))}
```

See the [TodoApp example](https://github.com/piconic-ai/barefootjs/blob/main/integrations/shared/components/TodoApp.tsx) for a real-world component using `/* @client */`.
