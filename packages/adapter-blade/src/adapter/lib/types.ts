/**
 * Shared type aliases for the Blade template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/lib/types.ts`: pure type
 * declarations — no runtime behaviour — so the extracted emit modules and
 * the main adapter share one definition rather than re-declaring the
 * render context / options shape.
 */

/** A template-primitive spec: expected call arity + the emit fn. */
export interface PrimitiveSpec {
  arity: number
  emit: (args: string[]) => string
}

/**
 * Blade adapter's IRNode render context. Like the Jinja adapter, Blade's
 * lowering doesn't consume any render-position flags, so the Ctx is empty.
 * Kept as a named alias so future flags can extend it without changing the
 * `IRNodeEmitter` interface.
 */
export type BladeRenderCtx = Record<string, never>

export interface BladeAdapterOptions {
  /** Base path for client JS files (default: '/static/components/') */
  clientJsBasePath?: string

  /** Path to barefoot.js runtime (default: '/static/components/barefoot.js') */
  barefootJsPath?: string
}
