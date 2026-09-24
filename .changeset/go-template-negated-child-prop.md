---
"@barefootjs/go-template": patch
---

A child component prop whose value is a negation (`showPlaceholder={!value()}`, `{!open()}`, `{!props.v}`) now reaches the child at SSR. It used to be dropped from the generated constructor, so the child saw `false` regardless of the real value (for example, `SelectTrigger`/`ComboboxTrigger` never rendered `data-placeholder`), with no diagnostic. A negated form that still cannot be lowered now refuses with `BF101` instead of being dropped silently.
