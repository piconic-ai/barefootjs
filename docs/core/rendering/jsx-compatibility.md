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
{items().filter(x => x.active).sort((a, b) => a.name > b.name ? 1 : -1).map(item => (
  <Item key={item.id} item={item} />
))}
```

Some comparators (e.g., `localeCompare`, block bodies) are not supported and will produce a compile error — use `/* @client */` in that case.


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

Some JavaScript expressions cannot be translated into marked template syntax. The compiler emits `BF021` for these. Add [`/* @client */`](./client-directive.md) to opt into client-only evaluation.

### Unsupported patterns

**Nested higher-order methods:**

```tsx
// ❌ Compile error (BF021)
{items().filter(x => x.tags().filter(t => t.active).length > 0)}

// ✅ Add /* @client */ to evaluate on the client
{/* @client */ items().filter(x => x.tags().filter(t => t.active).length > 0)}
```

**Unsupported array methods** (`.reduce()`, `.forEach()`, `.flatMap()`):

```tsx
// ❌ Compile error (BF021)
{items().reduce((sum, x) => sum + x.price, 0)}

// ✅ Use /* @client */
{/* @client */ items().reduce((sum, x) => sum + x.price, 0)}
```

**Destructuring in predicate parameters:**

```tsx
// ❌ Compile error (BF021)
{items().filter(({done}) => done).map(...)}

// ✅ Use a named parameter instead
{items().filter(t => t.done).map(...)}
```

**Function expressions** (`function` keyword):

```tsx
// ❌ Compile error (BF021)
{items().filter(function(x) { return x.done })}

// ✅ Use arrow functions instead
{items().filter(x => x.done)}
```

**Unsupported sort comparators** (`localeCompare`, block bodies):

```tsx
// ❌ Compile error (BF021)
{items().sort((a, b) => a.name.localeCompare(b.name)).map(...)}

// ✅ Use /* @client */
{/* @client */ items().sort((a, b) => a.name.localeCompare(b.name)).map(...)}
```

See the [TodoApp example](https://github.com/barefootjs/barefootjs/blob/main/integrations/shared/components/TodoApp.tsx) for a real-world component using `/* @client */`.
