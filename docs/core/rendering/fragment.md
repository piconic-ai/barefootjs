---
title: Fragment
description: Using fragments to render children without a wrapper element, including transparent fragment behavior.
---

# Fragment

Fragments (`<>...</>`) are supported. They render children without a wrapper element.

```tsx
<>
  <h1>Title</h1>
  <p>Description</p>
</>
```


## Transparent Fragments

A fragment that passes through `children` is treated as transparent — the compiler skips it and processes the children directly:

```tsx
<>{children}</>
<>{props.children}</>
```

No extra hydration markers are generated for transparent fragments.


## Fragments and Hydration

Fragments don't produce a DOM node. For conditional fragments, the compiler uses HTML comment markers as boundaries:

```html
<!--bf-cond-start:s0-->
<h1>Title</h1>
<p>Description</p>
<!--bf-cond-end:s0-->
```

The client runtime uses these comment markers to locate and swap the fragment content when the condition changes.

For component roots that return a fragment, each direct child element is marked with `bf-s` so the runtime can find them during hydration.
