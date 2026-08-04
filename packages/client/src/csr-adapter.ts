// Minimal `TemplateAdapter` passed as `adapter` to `@barefootjs/vite`'s
// `barefoot()` plugin for CSR projects (see `@barefootjs/client/csr-adapter`).
//
// CSR builds emit client JS only — a CSR project's `vite.config.ts` leaves
// `templates` unset (see `BarefootViteOptions`), and the plugin's own
// `assertNoRealTemplateOutput` (`packages/vite/src/plugin.ts`) refuses
// loudly if any adapter emits real, non-empty template output without a
// `templates` dir configured to hold it. All this adapter has to do is
// satisfy the `TemplateAdapter` interface so the compiler's pass-2 loop can
// call `adapter.generate()` without crashing.
//
// Historically the legacy build pipeline's `createConfig` reused
// `HonoAdapter` from `@barefootjs/hono/adapter` here as a "broad-acceptance
// JS template runtime". That pulled the entire Hono package into a CSR
// app's `node_modules` for an adapter whose every output was thrown away
// — confusing for users who picked CSR specifically to avoid an SSR
// framework dependency. This in-package adapter deletes the transitive
// Hono dep and keeps the analyzer-side behaviour identical
// (`acceptsTemplateCall: () => true`).
//
// What we still need from a "template adapter" in CSR mode:
//
//   - `acceptsTemplateCall: () => true`. This is consulted by the
//     IR analyzer + relocate pipeline (#1187 phase 3) when
//     deciding whether a call expression can live at template
//     scope vs init scope. The CSR "template" runs in the browser
//     via `@barefootjs/client/runtime`, so any synchronous JS call
//     is valid there — same contract as Hono SSR, where the broad
//     predicate originally lived. Without this the analyzer would
//     conservatively force calls into init scope and emit different
//     (less efficient) client JS.
//
//   - Sentinel `generate()` returning an empty `AdapterOutput`. The
//     compiler's pass-2 unconditionally calls `adapter.generate()`
//     to assemble the marked-template module string; in CSR mode
//     every field of that string is discarded before write, so we
//     just hand back empty strings and let the pipeline drop the
//     empty `markedTemplate` file at the gate.
//
//   - No-op render methods. The `TemplateAdapter` interface lists
//     them (`renderNode`, `renderElement`, etc.) but they are only
//     ever invoked from inside an adapter's own `generate()`. Since
//     ours returns early, these are never reached at runtime — they
//     exist purely to satisfy the contract.
//
// Everything else (`clientShimSource`, `templatePrimitives`,
// `generateSignalInitializers`, ...) is optional on `TemplateAdapter`
// and intentionally omitted: CSR has no SSR templates to shim into,
// no DSL-side primitive registry, and no init block to emit.

import type { AdapterOutput, TemplateSections } from '@barefootjs/jsx'
import { BaseAdapter } from '@barefootjs/jsx'

export interface CSRAdapterOptions {
  /**
   * Display name surfaced through `TemplateAdapter.name` — read by
   * `bf build` for its `Adapter: …` banner. Defaults to `'csr'`.
   */
  name?: string
}

// Frozen so a single shared sentinel can be returned from every
// `generate()` call without risking that a downstream consumer
// mutates it and bleeds state across compilations. `Object.freeze`
// is shallow, so we freeze both the outer `AdapterOutput` and the
// nested `sections` object — those are the two objects callers
// could write to (string/extension fields are primitives).
const EMPTY_SECTIONS: TemplateSections = Object.freeze({
  imports: '',
  types: '',
  component: '',
  defaultExport: '',
})

const EMPTY_OUTPUT: AdapterOutput = Object.freeze({
  template: '',
  sections: EMPTY_SECTIONS,
  extension: '.tsx',
})

export class CSRAdapter extends BaseAdapter {
  name: string
  extension = '.tsx'

  // Broad acceptance — matches Hono's contract, see the comment at
  // the top of this file for why CSR shares it.
  acceptsTemplateCall = (): boolean => true

  constructor(options: CSRAdapterOptions = {}) {
    super()
    this.name = options.name ?? 'csr'
  }

  // Sentinel: the marked-template is discarded in clientOnly mode,
  // so a single shared empty `AdapterOutput` (frozen — see
  // `EMPTY_OUTPUT` above) is enough. Re-creating per call would just
  // allocate garbage.
  generate(): AdapterOutput {
    return EMPTY_OUTPUT
  }

  // The render methods below would only ever be called from inside
  // an adapter's own `generate()`; since ours returns early, none of
  // them run at compile time. They exist purely to satisfy
  // `BaseAdapter`'s abstract surface. `BaseAdapter` already provides
  // a sensible default `renderAsync` that delegates to `renderNode`
  // + `renderChildren`, so we inherit that for free.
  renderNode(): string {
    return ''
  }
  renderElement(): string {
    return ''
  }
  renderExpression(): string {
    return ''
  }
  renderConditional(): string {
    return ''
  }
  renderLoop(): string {
    return ''
  }
  renderComponent(): string {
    return ''
  }
  renderScopeMarker(): string {
    return ''
  }
  renderSlotMarker(): string {
    return ''
  }
  renderCondMarker(): string {
    return ''
  }
}
