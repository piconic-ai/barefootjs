---
"@barefootjs/jsx": patch
---

Performance: compiled `.map()` loops now hoist a shared static `<template>` per loop and clone it per item, instead of building and parsing an HTML string per row. Dynamic text/attribute slots are filled by each binding's existing eager first effect run (eliminating the previous double write of initial values), and the clone path no longer routes values through HTML escaping (`textContent`/`setAttribute` are used directly). Applies only to statically-provable single-root loop bodies — conditional, multi-root, spread-attr, component, and nested-loop bodies keep the previous per-row emission; SVG loop bodies get the same namespace wrap as before. SSR marked-template output and the hydration path are byte-identical to before.
