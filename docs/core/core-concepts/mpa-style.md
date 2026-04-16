---
title: MPA-style Development
description: Server-rendering by default, with client JavaScript only where you need it
---

# MPA-style Development

> **Design Principle — MPA-style development.**
> Add interactive UI to existing server-rendered apps without adopting a full SPA framework. Each page is a normal route; client JavaScript is only loaded where you mark it.

## Server-First by Default

In BarefootJS, every component is a **server component** unless explicitly marked otherwise. Server components render to HTML on the server and send zero JavaScript to the browser:

```tsx
// Header.tsx — server component (no directive)
export function Header({ title }) {
  return <h1>{title}</h1>
}
```

This produces static HTML. No client JS, no hydration markers, no runtime overhead.

## JavaScript Only Where Marked

Client-side interactivity is opt-in. Add `"use client"` only to the components that need signals, effects, or event handlers:

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function SearchBox() {
  const [query, setQuery] = createSignal('')
  return (
    <input
      type="text"
      value={query()}
      onInput={(e) => setQuery(e.target.value)}
    />
  )
}
```

A page with 20 components and only one `"use client"` component ships JavaScript for that one component. The other 19 are pure HTML.

## Progressive Enhancement

BarefootJS fits naturally into existing server-rendered applications:

1. **Pages are normal routes** — Your server handles routing. Each page is a standard HTTP response.
2. **HTML renders before JS loads** — Server-rendered content is visible immediately. Hydration adds interactivity after the page is already usable.
3. **No full-page reloads for interactivity** — Client components hydrate in place. The rest of the page remains static HTML.
4. **Graceful degradation** — Server-rendered content works even if JavaScript fails to load.

```tsx
// ProductPage.tsx — server component
import { AddToCart } from './AddToCart'    // "use client"
import { ReviewStars } from './ReviewStars' // "use client"

export function ProductPage({ product }) {
  return (
    <div>
      <h1>{product.name}</h1>            {/* Static HTML */}
      <p>{product.description}</p>        {/* Static HTML */}
      <img src={product.image} />         {/* Static HTML */}
      <ReviewStars rating={product.rating} />  {/* Interactive */}
      <AddToCart productId={product.id} />     {/* Interactive */}
    </div>
  )
}
```

The product name, description, and image are server-rendered with no JS cost. Only `ReviewStars` and `AddToCart` ship client JavaScript.

## No Build-Time Framework Lock-in

Unlike SPA frameworks that require a specific router, state management solution, and build pipeline, BarefootJS works with whatever server stack you already have:

- **Routing**: Your server's routing (Hono, Go `net/http`, etc.)
- **Data fetching**: Your server's data layer (SQL, ORM, API calls)
- **Templating**: The compiler generates templates that plug into your existing template engine

You add BarefootJS components to pages — you don't rewrite pages around BarefootJS.
