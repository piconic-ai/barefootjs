---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

On go-template, a component called without children now reads `props.children` as `undefined`, as Hono does: `props.children === undefined` and a signal seeded from it take the fallback branch, directly, through a destructured `children` binding and when a parent forwards `children={props.children}` from a call without children. The generated constructor reads an `interface{}` Children Input field through the new runtime helper `bf.ChildrenIn`, which reads a field the Input leaves out as `bf.Undefined`; a parent writes an explicit children value through the new `bf.PassChildren`, so `children={null}` still reads as `null`. A Go host that builds a component's Input without `Children` therefore passes no children, where it passed `null` before. A concrete Children field (a required `children: string`) is unchanged.

A signal seeded `<prop> ?? <fallback>` over a prop declared `unknown` or `any` (`createSignal(props.children ?? 'missing')`) is now typed `unknown` by Phase 1 instead of the fallback's type, so go-template holds whatever the caller passes, markup children or a number, instead of panicking at render with `interface conversion: interface {} is template.HTML, not string` (or `bf.OptOf: a int cannot be a string`). A prop with a concrete type and an explicit type argument keep the type they had.
