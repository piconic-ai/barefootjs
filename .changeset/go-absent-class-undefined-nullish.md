---
"@barefootjs/go-template": patch
---

An absent optional value bound to `class`, `className` or `style` (`className={props.tone}`, a static child's `class={tone}`, an object signal's `class={look()?.tone}`) now omits the attribute, as Hono does and as every other attribute already did; it used to render `class=""`. The nested `undefined` identifier now lowers to `nil`, as `null` does, so `undefined ?? 'x'` renders `x` in text and attribute position instead of an empty value.
