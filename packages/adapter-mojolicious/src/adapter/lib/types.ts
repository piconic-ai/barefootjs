/**
 * Shared type aliases for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure type declarations — no runtime behaviour — so the
 * extracted emit modules and the main adapter share one definition
 * rather than re-declaring the render context / options shape.
 */

/** A template-primitive spec: expected call arity + the emit fn. */
export interface PrimitiveSpec {
  arity: number
  emit: (args: string[]) => string
}

/**
 * Mojo adapter's IRNode render context. Mojo's lowering currently
 * doesn't consume any render-position flags (`isRootOfClientComponent`
 * is handled differently here than in Hono/Go), so the Ctx is empty.
 * Kept as a named alias so future flags can extend it without changing
 * the `IRNodeEmitter` interface.
 */
export type MojoRenderCtx = Record<string, never>

export interface MojoAdapterOptions {
  /** Base path for client JS files (default: '/static/components/') */
  clientJsBasePath?: string

  /** Path to barefoot.js runtime (default: '/static/components/barefoot.js') */
  barefootJsPath?: string
}
