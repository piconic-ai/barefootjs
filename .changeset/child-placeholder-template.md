---
"@barefootjs/jsx": patch
---

A child component the client mounts in place of a placeholder (a child deferred to init because a prop reads an init-only value, or a child inside a client-built loop row) now mounts inside its parent when that parent is a `<p>` (also through a `<span>` in it), a `<tbody>`, a `<tr>` or an `<svg>`. The client template's placeholder was a `<div>`, which the HTML parser moves out of those parents (it closes the paragraph, is placed before the table, or ends the SVG), so the child landed outside its parent. The placeholder is now a `<template data-bf-ph="…">` element, which parses in place in every such parent. The runtime locates placeholders by their attribute as before, so output compiled earlier keeps working.
