/**
 * BarefootJS minijinja (Rust) Template Adapter
 *
 * Generates Jinja2-compatible template files (.j2) from BarefootJS IR,
 * rendered by the `minijinja` Rust crate. Near-verbatim port of
 * `@barefootjs/jinja` — see `adapter/minijinja-adapter.ts`'s file header for
 * the full design record.
 */

export { MinijinjaAdapter, minijinjaAdapter } from './adapter/index.ts'
export type { MinijinjaAdapterOptions } from './adapter/index.ts'
export { conformancePins } from './conformance-pins.ts'
