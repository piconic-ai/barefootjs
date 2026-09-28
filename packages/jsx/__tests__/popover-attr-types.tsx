/**
 * Type-only verification that the Popover API attributes (`popover`,
 * `popovertarget`, `popovertargetaction`) type-check in JSX without a
 * `@ts-expect-error` escape (#3236) — except the one deliberately-rejected
 * case noted below.
 *
 * `popover` is a global attribute (`HTMLBaseAttributes`, checked here via
 * `<div>`); `popovertarget`/`popovertargetaction` are checked on `<button>`
 * and on `<input type="button">`, matching the issue's proposal. There are
 * no runtime assertions; the runner is
 * `tsc --noEmit -p packages/jsx/__tests__/tsconfig.json` (via
 * `bun run typecheck:tests`), against the real `jsxImportSource:
 * "@barefootjs/jsx"` resolution — the same `IntrinsicElements` a consumer's
 * own `.tsx` file resolves through.
 *
 * The trailing `export {}` is load-bearing — see `svg-ref-types.tsx` for why.
 */

// `popover` is a global attribute, exercised here on a plain `<div>`.
const _popoverEmpty = <div popover="">...</div>
const _popoverAuto = <div popover="auto">...</div>
const _popoverManual = <div popover="manual">...</div>
const _popoverHint = <div popover="hint">...</div>

// A `boolean` value is rejected on purpose (Pullfrog review on #3255):
// `popover={false}` would render `popover="false"`, an invalid keyword the
// spec maps to `manual` — so the element would STILL be a popover, not
// opted out — and `popover={true}` renders `"true"`, also `manual`, not
// `auto`. Neither reflects what the boolean value means.
// @ts-expect-error - boolean is not a valid `popover` value, see html-types.ts
const _popoverBoolean = <div popover={true}>...</div>

// `popovertarget` / `popovertargetaction` on `<button>`.
const _button = (
  <button type="button" popovertarget="panel" popovertargetaction="toggle">
    Open
  </button>
)

// `popovertarget` / `popovertargetaction` on `<input type="button">`.
const _input = (
  <input type="button" popovertarget="panel" popovertargetaction="show" />
)

export { _popoverEmpty, _popoverAuto, _popoverManual, _popoverHint, _popoverBoolean, _button, _input }
