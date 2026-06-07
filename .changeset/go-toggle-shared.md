---
"@barefootjs/go-template": patch
---

Graduate the `toggle-shared` conformance fixture to Hono parity on the Go template adapter — the last adapter that still skipped it. `toggle-shared` is a keyed `.map` of sibling `ToggleItem` children, each with a per-item prop-derived signal.

The adapter's generated types were already correct (typed `[]ToggleItemInput` slice, per-item `On: in.DefaultOn` seeding, `ToggleItem_<rand>` scope ids — fixed by intervening array-baking work). Two remaining gaps were closed:

1. **Typed prop-array literal (test harness).** The Go test-render serialised an array-of-objects prop as `[]any{…}`, which failed to compile against the typed `ToggleItems []ToggleItemInput` Input field. It now reads the field's element type from the generated `<Component>Input` struct and emits a matching typed slice of keyed struct literals (`[]ToggleItemInput{ToggleItemInput{Label: …, DefaultOn: …}, …}`), with omitted optional keys taking the Go zero value.

2. **`data-key`.** A keyed loop child now stamps `data-key` for reconciliation parity. Every component `Props` gains a `BfDataKey` field; the parent's loop init sets it per item from the loop `key` expression (`item.label` → `fmt.Sprint(item.Label)`); and the component's scope root emits `{{if .BfDataKey}}data-key="{{.BfDataKey}}"{{end}}`. Emission is scoped to the component root element(s) — including each branch top of an early-return (`if-statement`) root — so non-keyed renders add nothing.

This clears the final `toggle-shared` skip; the shared JSX conformance corpus now renders to Hono parity on Go, Mojolicious, and Text::Xslate alike. Measured against real Go 1.25.6. Hono reference snapshots unchanged.
