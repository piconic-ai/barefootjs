/**
 * BarefootJS Pebble Template Adapter — Phase 1 skeleton (#2101).
 *
 * Generates Pebble template files (.peb) from BarefootJS IR, targeting the
 * JVM (Spring Boot, Ktor, plain Servlet apps) via the
 * [Pebble](https://pebbletemplates.io/) templating engine.
 *
 * Phase 0 scoping decisions (see `add-adapter` skill, and the package
 * README's "Design decisions" section for the full rationale):
 *   - Runtime model: DSL (`templatePrimitives` only — Pebble cannot execute
 *     arbitrary JS, unlike the Hono/JSX reference adapter).
 *   - `templatesPerComponent = true`, extension `.peb` — matches the
 *     Jinja/Twig family this adapter is ported from.
 *   - Native runtime lives in-package at `packages/adapter-pebble/java/`.
 *   - Helper naming convention: `bf.*` (e.g. `bf.renderChild`), matching the
 *     Jinja/Twig/ERB/Blade family rather than Go's `bf_*` or Perl's `bf->*`.
 *
 * This file currently implements only enough of `TemplateAdapter` to satisfy
 * the interface and type-check (`tsgo --noEmit`) — the render methods are
 * filled in by the follow-up "adapter core" PR in the #2101 stack. Nothing
 * here is wired into the conformance suite yet.
 */

import type {
  AdapterGenerateOptions,
  AdapterOutput,
  ComponentIR,
  IRAsync,
  IRComponent,
  IRConditional,
  IRElement,
  IRExpression,
  IRLoop,
  IRNode,
} from '@barefootjs/jsx'
import { BaseAdapter } from '@barefootjs/jsx'

export interface PebbleAdapterOptions {
  /** Base path used to build the shared runtime's `<script>` registration
   * when the adapter is invoked outside the Vite plugin (see
   * `JinjaAdapterOptions.clientJsBasePath` for the sibling adapters'
   * identical fallback). Unused once `AdapterGenerateOptions.scriptAssets`
   * is supplied by `@barefootjs/vite`. */
  clientJsBasePath?: string
  /** Base path for a component's own compiled `.client.js`, same fallback
   * role as `clientJsBasePath` above. */
  barefootJsPath?: string
}

const NOT_YET_IMPLEMENTED = 'PebbleAdapter: not yet implemented (tracked in #2101 — this lands in the adapter-core PR)'

export class PebbleAdapter extends BaseAdapter {
  name = 'pebble'
  extension = '.peb'
  templatesPerComponent = true

  constructor(_options: PebbleAdapterOptions = {}) {
    super()
  }

  generate(_ir: ComponentIR, _options?: AdapterGenerateOptions): AdapterOutput {
    throw new Error(NOT_YET_IMPLEMENTED)
  }

  renderNode(_node: IRNode): string {
    throw new Error(NOT_YET_IMPLEMENTED)
  }

  renderElement(_element: IRElement): string {
    throw new Error(NOT_YET_IMPLEMENTED)
  }

  renderExpression(_expr: IRExpression): string {
    throw new Error(NOT_YET_IMPLEMENTED)
  }

  renderConditional(_cond: IRConditional): string {
    throw new Error(NOT_YET_IMPLEMENTED)
  }

  renderLoop(_loop: IRLoop): string {
    throw new Error(NOT_YET_IMPLEMENTED)
  }

  renderComponent(_comp: IRComponent): string {
    throw new Error(NOT_YET_IMPLEMENTED)
  }

  renderAsync(_node: IRAsync): string {
    throw new Error(NOT_YET_IMPLEMENTED)
  }

  renderScopeMarker(_instanceIdExpr: string): string {
    throw new Error(NOT_YET_IMPLEMENTED)
  }

  renderSlotMarker(_slotId: string): string {
    throw new Error(NOT_YET_IMPLEMENTED)
  }

  renderCondMarker(_condId: string): string {
    throw new Error(NOT_YET_IMPLEMENTED)
  }
}

export const pebbleAdapter = new PebbleAdapter()
