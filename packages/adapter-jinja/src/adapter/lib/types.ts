/**
 * Shared type aliases for the Jinja2 template adapter.
 *
 * Extracted the way `packages/adapter-xslate/src/adapter/lib/types.ts` is:
 * pure type declarations — no runtime behaviour — so the extracted emit
 * modules and the main adapter share one definition rather than
 * re-declaring the render context / options shape.
 */

/** A template-primitive spec: expected call arity + the emit fn. */
export interface PrimitiveSpec {
  arity: number
  emit: (args: string[]) => string
}

/**
 * Jinja adapter's IRNode render context. Like the Xslate adapter, Jinja's
 * lowering doesn't consume any render-position flags, so the Ctx is empty.
 * Kept as a named alias so future flags can extend it without changing the
 * `IRNodeEmitter` interface.
 */
export type JinjaRenderCtx = Record<string, never>

export interface JinjaAdapterOptions {
  /** Base path for client JS files (default: '/static/components/') */
  clientJsBasePath?: string

  /** Path to barefoot.js runtime (default: '/static/components/barefoot.js') */
  barefootJsPath?: string
}
