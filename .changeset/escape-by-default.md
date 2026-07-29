---
"@barefootjs/jsx": minor
---

Escape text by default; decide escaping from the IR, not from slot position.

**This changes rendered output.** A reactive conditional whose branch is TEXT
used to interpolate the value into the branch template unescaped. With
`row.a = 'A&<b>'`, `{sel() === row.id ? row.a : row.b}` emitted:

```html
<td bf="s1"><!--bf-cond-start:s0-->A&<b><!--bf-cond-end:s0--></td>
```

which the HTML parser turns into a real `<b>` element that also swallows the
range marker:

```html
<td bf="s1"><!--bf-cond-start:s0-->A&amp;<b><!--bf-cond-end:s0--></b></td>
```

`textContent` was `"A&"` instead of `"A&<b>"` — the intended text was lost —
and `bf-cond-end` ended up inside the injected element, so data could relocate
the boundary `insert()` swaps branches against. The same expression wrapped in
`String(...)` was escaped, because that shape lowers to a text slot instead.

The cause was one asymmetry repeated in all four template renderers: the
slotted form escaped, the un-slotted form did not. A conditional branch's inner
text carries no slot id — the conditional owns it — so it always landed on the
un-slotted path. Position and content kind were conflated.

`IRExpression.contentKind?: 'text' | 'markup'` now carries the decision, made
in Phase 1 where the compiler already knows the answer, and the renderers
branch on it. **Absent means text — escape.** An unclassified expression
therefore fails toward a visibly wrong render (`&lt;b&gt;` on screen) rather
than toward HTML injection, and the client emission now agrees with every SSR
backend this project targets: Jinja / MiniJinja / Twig / Xslate `autoescape`,
Blade `{{ }}`, Go `html/template`, Mojolicious auto-escape — each escaping by
default with an explicit raw opt-out.

`'markup'` is set only where the value really is HTML:

- a `children` passthrough, including the `props.children ?? ''`,
  `props.children || fallback` and `cond ? props.children : null` idioms.
  `String(props.children)` and `'x' + props.children` are NOT markup — they
  stringify it, so escaping their result is correct.
- `joinArrayChild`, a `.map()` preamble's array of element strings.

**What breaks.** Code that relied on a conditional branch rendering an HTML
string as markup now renders it as text. That behaviour was an accident of the
missing escape, not a feature. The element-level `dangerouslySetInnerHTML` is
unaffected and remains the supported way to inject HTML; a `raw()` opt-out for
the child position is a follow-up.

Also removes `escapeLeafTextExpressions`, an IR pre-pass that existed only to
pre-wrap un-slotted preamble leaves. With the emitters deciding from IR it was
a second wrapper; preamble leaves now emit `escapeText(c)` rather than
`escapeText((c))`, escaped exactly once.
