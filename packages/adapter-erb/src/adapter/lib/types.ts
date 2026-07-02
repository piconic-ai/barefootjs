/**
 * Shared type aliases for the ERB template adapter.
 *
 * Ported from the Mojolicious adapter's `lib/types.ts`. Pure type
 * declarations — no runtime behaviour — so the extracted emit modules and
 * the main adapter share one definition rather than re-declaring the render
 * context / options shape.
 */

/** A template-primitive spec: expected call arity + the emit fn. */
export interface PrimitiveSpec {
  arity: number
  emit: (args: string[]) => string
}

/**
 * ERB adapter's IRNode render context. The ERB lowering currently doesn't
 * consume any render-position flags (`isRootOfClientComponent` is handled
 * differently here than in Hono/Go), so the Ctx is empty. Kept as a named
 * alias so future flags can extend it without changing the `IRNodeEmitter`
 * interface.
 */
export type ErbRenderCtx = Record<string, never>

export interface ErbAdapterOptions {
  /** Base path for client JS files (default: '/static/components/') */
  clientJsBasePath?: string

  /** Path to barefoot.js runtime (default: '/static/components/barefoot.js') */
  barefootJsPath?: string
}
