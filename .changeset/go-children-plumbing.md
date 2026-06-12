---
"@barefootjs/go-template": minor
---

JSX children passed to imported child components now render on Go (#1896) instead of silently dropping. Action-bearing children (nested components, dynamic text) lower to a per-call-site companion define executed with the parent's data and injected into the child's props:

- New runtime helpers: `bf.TemplateFuncMap(t)` (provides `bf_tmpl`, a closure over the executing template set — register it alongside `bf.FuncMap()` before parsing) and `bf.WithChildren` (registered as `bf_with_children`).
- The adapter emits `{{template "Child" (bf_with_children .ChildSlotN (bf_tmpl "<Parent>__children_<slot>" .))}}` for such call sites, and collects component instances / keyed loops nested inside children onto the parent's props.

A long tail of codegen fixes rode along, surfaced by the composed `site/ui` demo corpus (all verified to byte parity with the Hono reference): multi-component-file `restPropsName` staleness in `generateTypes` (`in.Props undefined`), memo-vs-prop struct field collisions (`ClassName redeclared`), reference-typed zero values (`0` into `map`/`bool` fields), compile-time resolution of module-const record lookups (`strokePaths['chevron-down']`, `variantClasses.ghost`) and literal consts, template-literal ternary double-wrapping (`{{{{if`), parenthesised compound args (`eq (or .X "top") "left"`, `bf_string (…)`), string-tolerant equality (`eq (bf_string .Sorted) "asc"` for union-typed props), ARIA presence attributes rendering as `aria-x="true"`, and `attr={cond ? value : undefined}` omitting the attribute like Hono.
