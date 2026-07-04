/**
 * Shared type aliases for the minijinja template adapter.
 *
 * Near-verbatim port of `packages/adapter-jinja/src/adapter/lib/types.ts`
 * (itself extracted the way `packages/adapter-xslate/src/adapter/lib/types.ts`
 * is): pure type declarations — no runtime behaviour — so the extracted emit
 * modules and the main adapter share one definition rather than
 * re-declaring the render context / options shape. The emitted template
 * syntax is identical to adapter-jinja's (both target Jinja2-compatible
 * syntax); only the render engine (minijinja, Rust) and identity fields
 * differ, so the type names below keep their `Jinja*` shape rather than
 * being renamed per-file.
 */

/** A template-primitive spec: expected call arity + the emit fn. */
export interface PrimitiveSpec {
  arity: number
  emit: (args: string[]) => string
}

/**
 * The adapter's IRNode render context. Like the Xslate adapter, Jinja2's
 * lowering doesn't consume any render-position flags, so the Ctx is empty.
 * Kept as a named alias so future flags can extend it without changing the
 * `IRNodeEmitter` interface.
 */
export type JinjaRenderCtx = Record<string, never>

export interface MinijinjaAdapterOptions {
  /** Base path for client JS files (default: '/static/components/') */
  clientJsBasePath?: string

  /** Path to barefoot.js runtime (default: '/static/components/barefoot.js') */
  barefootJsPath?: string
}
