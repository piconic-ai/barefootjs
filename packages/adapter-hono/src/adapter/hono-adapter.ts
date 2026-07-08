/**
 * BarefootJS Hono Adapter
 *
 * Generates Hono JSX from Pure IR.
 */

import {
  type ComponentIR,
  type IRNode,
  type IRElement,
  type IRText,
  type IRExpression,
  type IRConditional,
  type IRLoop,
  type IRComponent,
  type IRFragment,
  type IRIfStatement,
  type IRProvider,
  type IRAsync,
  type IRSlot,
  type AttrValue,
  type IRTemplatePart,
  type ParamInfo,
  type AdapterGenerateOptions,
  type AdapterOutput,
  type TemplateSections,
  type JsxAdapterConfig,
  type IRNodeEmitter,
  type EmitIRNode,
  type AttrValueEmitter,
  JsxAdapter,
  isBooleanAttr,
  rewriteImportsForTemplate,
  emitIRNode,
  emitAttrValue,
  buildLoopChainExpr,
} from '@barefootjs/jsx'

/**
 * Hono adapter's IRNode render context: which surrounding render
 * state matters when lowering a node. The `IRNodeEmitter` dispatcher
 * threads this `Ctx` unchanged into per-kind methods; per-method
 * documentation below records which flags each kind consults.
 */
type HonoRenderCtx = {
  isRootOfClientComponent?: boolean
  isInsideLoop?: boolean
  isLoopItemRoot?: boolean
}
import { BF_SCOPE, BF_HOST, BF_AT, BF_ROOT, BF_PROPS, BF_REGION, escapeHtml } from '@barefootjs/shared'

export interface HonoAdapterOptions {
  /**
   * Base path for client JS files (e.g., '/static/components/')
   * Used to generate script src attributes.
   */
  clientJsBasePath?: string

  /**
   * Path to barefoot.js runtime (e.g., '/static/components/barefoot.js')
   */
  barefootJsPath?: string

  /**
   * Client JS filename (without path). When set, all components use this filename.
   * When not set, uses `{componentName}.client.js`.
   * Useful for files with multiple components that share a single client JS file.
   */
  clientJsFilename?: string

  /**
   * Display name surfaced through `JsxAdapter.name` — read by `bf build`
   * for its `Adapter: …` banner. Defaults to `'hono'`. CSR-mode callers
   * (`@barefootjs/client/build`) pass `'csr'` so the banner reflects the
   * mode the user picked at scaffold time instead of leaking the
   * fact that CSR currently reuses HonoAdapter under the hood.
   */
  name?: string
}

/**
 * Mirror `IRLoop.sortComparator` / `IRLoop.filterPredicate` chaining
 * into the JSX expression that backs the Hono `.map()` call.
 * Delegates to the shared `buildLoopChainExpr` so the chain shape
 * stays byte-equal with the client-template emit
 * (`html-template.ts:applyLoopChain`) and the control-flow plans
 * (`utils.ts:buildChainedArrayExpr`) — drift between the three
 * would silently produce different sorted orders depending on
 * which path consumed the IR. Always uses `.toSorted`
 * (non-mutating) so shared prop arrays aren't reordered in place
 * across renders.
 */
function applyHonoLoopChain(loop: IRLoop): string {
  return buildLoopChainExpr({
    base: loop.array,
    sortComparator: loop.sortComparator,
    filterPredicate: loop.filterPredicate,
    chainOrder: loop.chainOrder,
  })
}

export class HonoAdapter extends JsxAdapter implements IRNodeEmitter<HonoRenderCtx> {
  name = 'hono'
  extension = '.tsx'
  clientShimSource = '@barefootjs/hono/client-shim'
  // Importmap is injected at render time by the `BfImportMap` component
  // (reads `barefoot-externals.json`), so `bf build` emits no static snippet.
  importMapInjection = 'component' as const

  // The Hono SSR runtime is JavaScript (Node / Bun / CF Workers), so any
  // synchronous JS call the user writes can be rendered as-is at template
  // scope — there is no language-level subset to enumerate. Broad
  // acceptance is the contract.
  //
  // What this delegates to the user: Hono accepts the call; whether that
  // call actually works at SSR is the user's responsibility. A function
  // that touches `window` / `document` / `localStorage` will throw a clear
  // ReferenceError at build time rather than silently rendering as
  // `undefined`. The fix is to wrap the offending JSX expression with
  // `/* @client */` so the call is deferred to hydrate.
  //
  // Component-internal bindings (signals, memos, init-locals, destructured
  // props) are still correctly rejected by the shadow guard inside
  // `isCallAcceptedByAdapter` (relocate.ts), regardless of what this
  // predicate returns — those identifiers carry a non-`global`/`module-*`
  // BindingKind, so the guard short-circuits before the predicate runs.
  acceptsTemplateCall = (): boolean => true

  protected jsxConfig: JsxAdapterConfig = { preserveTypes: true }

  private options: HonoAdapterOptions
  private isClientComponent: boolean = false
  private hasClientInteractivity: boolean = false
  private currentComponentHasProps: boolean = false
  /**
   * Per-call relative-import rewriter supplied by the build pipeline so
   * source-authored relative paths resolve correctly from the emitted
   * file's on-disk position (#1453). Stashed for the duration of one
   * `generate()` call so `generateImports` can apply it; cleared on exit
   * so a singleton adapter instance does not leak state between
   * components.
   */
  private rewriteRelativeImport?: (importPath: string) => string
  /** Stack of loop keys for generating data-key / data-key-1 attributes on loop items */
  private loopKeyStack: Array<{ key: string | null; param: string }> = []

  constructor(options: HonoAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
      clientJsFilename: options.clientJsFilename,
    }
    if (options.name) this.name = options.name
  }

  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput {
    this.componentName = ir.metadata.componentName
    this.isClientComponent = ir.metadata.isClientComponent
    this.rewriteRelativeImport = options?.rewriteRelativeImport

    // Generate component body FIRST so we can scan it for used imports
    const component = this.generateComponent(ir)
    const types = this.generateTypes(ir, component)
    const componentCode = [types, component].filter(Boolean).join('\n')
    const imports = this.generateImports(ir, componentCode)
    // Module-level Context bindings (`const Ctx = createContext()`) are
    // skipped from the SSR signal-initializer block by JsxAdapter — they
    // need to live at module scope so providers and consumers in the same
    // render share the same Context object identity. Emitted in a dedicated
    // section so multi-component dedup works on the full block (not per
    // line, which would split multi-line `({...})` arguments).
    const moduleConstants = this.generateModuleLevelContextBindings(ir)

    const defaultExport = ir.metadata.hasDefaultExport
      ? `\nexport default ${this.componentName}`
      : ''

    const sections: TemplateSections = {
      imports,
      types: types || '',
      component,
      defaultExport,
      moduleConstants,
    }

    // Assemble template for backward compat (external consumers using output.template)
    const template = [imports, moduleConstants, types, component].filter(Boolean).join('\n\n') + defaultExport

    const result: AdapterOutput = {
      template,
      sections,
      types: types || undefined,
      extension: this.extension,
    }
    this.rewriteRelativeImport = undefined
    return result
  }

  private generateModuleLevelContextBindings(ir: ComponentIR): string {
    const lines: string[] = []
    for (const c of ir.metadata.localConstants) {
      if (!c.isModule) continue
      if (c.isExported) continue
      if (c.systemConstructKind !== 'createContext') continue
      if (!c.value) continue
      const keyword = c.declarationKind ?? 'const'
      const value = this.jsxConfig.preserveTypes ? (c.typedValue ?? c.value) : c.value
      lines.push(`${keyword} ${c.name} = ${value}`)
    }
    return lines.join('\n')
  }

  // ===========================================================================
  // Imports Generation
  // ===========================================================================

  private generateImports(ir: ComponentIR, componentCode: string): string {
    const lines: string[] = []

    // Only import bfComment/bfText/bfTextEnd utilities that are actually used
    const utilImports: string[] = []
    for (const util of ['bfComment', 'bfText', 'bfTextEnd']) {
      if (new RegExp(`\\b${util}\\b`).test(componentCode)) {
        utilImports.push(util)
      }
    }
    if (utilImports.length > 0) {
      lines.push(`import { ${utilImports.join(', ')} } from '@barefootjs/hono/utils'`)
    }

    // Import Suspense / ErrorBoundary when async boundaries are used. Both
    // are imported under `__Bf`-prefixed aliases (and emitted as such by
    // `renderAsync`) so the generated tags can never collide with a user
    // component literally named `Suspense` or `ErrorBoundary` — a bare-name
    // import would otherwise duplicate the user's own import binding (#1375).
    if (componentCode.includes('<__BfSuspense')) {
      lines.push(`import { Suspense as __BfSuspense } from 'hono/jsx/streaming'`)
    }
    if (componentCode.includes('<__BfErrorBoundary')) {
      lines.push(`import { ErrorBoundary as __BfErrorBoundary } from 'hono/jsx'`)
    }

    // Re-emit template imports, rewriting `@barefootjs/client` to this
    // adapter's SSR shim AND re-anchoring relative paths from the emit
    // location when the caller supplied a `rewriteRelativeImport` hook
    // (#1453). Adapters own both rewrites; the compiler hands us the
    // raw import list.
    const templateImports = rewriteImportsForTemplate(
      ir.metadata.templateImports,
      this.clientShimSource,
      this.rewriteRelativeImport,
    )
    for (const imp of templateImports) {
      if (imp.specifiers.length === 0) {
        if (!imp.isTypeOnly) {
          lines.push(`import '${imp.source}'`)
        }
        continue
      }
      if (imp.isTypeOnly) {
        lines.push(`import type ${this.formatImportSpecifiers(imp.specifiers)} from '${imp.source}'`)
      } else {
        lines.push(`import ${this.formatImportSpecifiers(imp.specifiers)} from '${imp.source}'`)
      }
    }

    // Provider IR rendering emits `provideContextSSR(...)` calls. Emit the
    // import on its own line so multi-component files dedupe it cleanly via
    // the compiler's per-line import merging.
    if (/\bprovideContextSSR\(/.test(componentCode)) {
      lines.push(`import { provideContextSSR } from '@barefootjs/hono/client-shim'`)
    }

    return lines.join('\n')
  }

  // ===========================================================================
  // Types Generation
  // ===========================================================================

  generateTypes(ir: ComponentIR, componentBody?: string): string | null {
    const lines: string[] = []

    // Include original type definitions — only those referenced in the component body
    // or transitively referenced by other included type definitions
    if (componentBody && ir.metadata.typeDefinitions.length > 0) {
      const propsTypeName = this.getPropsTypeName(ir)
      // Seed the reachability scan with everything that ends up referencing
      // a type name in the FINAL emitted file, not just the component body.
      //
      // - `propsTypeName` is referenced by the synthesized
      //   `${Name}PropsWithHydration = ${propsTypeName} & {...}` alias the
      //   destructured-props branch emits below — but that alias is built
      //   AFTER this scan, so the body never literally mentions e.g.
      //   `ButtonProps`. Without seeding it here the alias references an
      //   undeclared name (TS2304) and TS widens `variant`/`size` to `any`
      //   at every `Record[variant]` lookup site (TS7053) downstream.
      //
      // - Named re-export blocks (`export type { ButtonVariant, ButtonSize,
      //   ButtonProps }`) are emitted by the compiler's `generateModuleExports`
      //   AFTER `s.types`. Each re-exported local name needs its declaration
      //   carried forward too. Issue #1453 covers the full reproduction.
      const seedText = [
        componentBody,
        propsTypeName && !ir.metadata.propsObjectName ? propsTypeName : '',
        ...ir.metadata.namedExports
          .filter((block) => block.source === null)
          .flatMap((block) => block.specifiers.map((s) => s.name)),
      ].filter(Boolean).join('\n')

      const included = new Set<string>()
      // First pass: include types directly referenced in the seed text
      for (const typeDef of ir.metadata.typeDefinitions) {
        if (new RegExp(`\\b${typeDef.name}\\b`).test(seedText)) {
          included.add(typeDef.name)
        }
      }
      // Transitive pass: include types referenced by already-included types
      let changed = true
      while (changed) {
        changed = false
        for (const typeDef of ir.metadata.typeDefinitions) {
          if (included.has(typeDef.name)) continue
          for (const name of included) {
            const includedDef = ir.metadata.typeDefinitions.find(t => t.name === name)
            if (includedDef && new RegExp(`\\b${typeDef.name}\\b`).test(includedDef.definition)) {
              included.add(typeDef.name)
              changed = true
              break
            }
          }
        }
      }
      for (const typeDef of ir.metadata.typeDefinitions) {
        if (included.has(typeDef.name)) lines.push(typeDef.definition)
      }
    } else {
      for (const typeDef of ir.metadata.typeDefinitions) {
        lines.push(typeDef.definition)
      }
    }

    // Generate hydration props type (only when destructured-props pattern uses it;
    // SolidJS-style props use inline type annotation instead)
    const propsTypeName = this.getPropsTypeName(ir)
    if (propsTypeName && !ir.metadata.propsObjectName) {
      lines.push('')
      lines.push(`type ${this.componentName}PropsWithHydration = ${propsTypeName} & {`)
      lines.push('  __instanceId?: string')
      lines.push('  __bfScope?: string')
      lines.push('  __bfChild?: boolean')
      lines.push('  __bfParentProps?: string')
      lines.push('  __bfParent?: string')
      lines.push('  __bfMount?: string')
      lines.push('  "data-key"?: string | number')
      lines.push('}')
    }

    return lines.length > 0 ? lines.join('\n') : null
  }

  private getPropsTypeName(ir: ComponentIR): string | null {
    if (ir.metadata.propsType?.raw) {
      return ir.metadata.propsType.raw
    }
    return null
  }

  // ===========================================================================
  // Component Generation
  // ===========================================================================

  private generateComponent(ir: ComponentIR): string {
    const name = ir.metadata.componentName
    const propsTypeName = this.getPropsTypeName(ir)

    // Validate: only reactive primitives (signals, memos, effects, onMounts) require "use client"
    // Env signals (`createSearchParams()`, #2057) are exempt — reading the
    // request query is SSR-safe and needs no hydration, so a component that only
    // reads an env signal stays a plain SSR component (as `searchParams()` did
    // before it became a structural signal).
    const hasReactivePrimitives =
      ir.metadata.signals.some(s => !s.envReader) ||
      ir.metadata.memos.length > 0 ||
      ir.metadata.effects.length > 0 ||
      ir.metadata.onMounts.length > 0

    if (hasReactivePrimitives && !ir.metadata.isClientComponent) {
      throw new Error(
        `Component "${name}" has reactive primitives (signals, memos, effects, or onMounts) ` +
        `but is not marked as a client component. Add "use client" directive at the top of the file.`
      )
    }

    // A component needs client interactivity if it has "use client" OR if it has event handlers
    // that need client JS wiring (detected by analyzeClientNeeds)
    const needsClientInit = ir.metadata.clientAnalysis?.needsInit ?? false
    const hasClientInteractivity = ir.metadata.isClientComponent || needsClientInit
    this.hasClientInteractivity = hasClientInteractivity

    // Check if component uses props object pattern (SolidJS-style)
    const propsObjectName = ir.metadata.propsObjectName

    // Build props parameter based on pattern
    let fullPropsDestructure: string
    let typeAnnotation: string
    let propsExtraction: string | null = null

    // Synthetic hydration-only props the generated wrapper destructures
    // out of `props` before reaching the user's body. Kept as a shared
    // constant so the `propsObjectName` (SolidJS-style) and destructured
    // branches both list every hydration field — the destructured
    // branch's fallback used to declare only `__instanceId / __bfScope
    // / __bfChild`, but the generated body destructures `__bfParent /
    // __bfMount / __bfParentProps / data-key` too, so tsc raised
    // TS2339 ("Property '__bfParent' does not exist...") on every
    // emitted SSR template for a component without an explicit Props
    // type. See onboarding round 5 / PR #1450.
    const HYDRATION_PROPS_TYPE =
      '{ __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }'

    if (propsObjectName) {
      // SolidJS-style: function Component(props: Props)
      // Accept all props as a single object, then destructure hydration props out
      fullPropsDestructure = `__allProps`
      typeAnnotation = propsTypeName
        ? `: ${propsTypeName} & ${HYDRATION_PROPS_TYPE}`
        : `: Record<string, unknown> & ${HYDRATION_PROPS_TYPE}`
      // propsExtraction is rebuilt after jsxBody generation with unused-aware aliases
    } else {
      // Destructured props pattern — fullPropsDestructure rebuilt after jsxBody with unused-aware aliases
      fullPropsDestructure = '' // placeholder, rebuilt below
      typeAnnotation = propsTypeName
        ? `: ${name}PropsWithHydration`
        : `: ${HYDRATION_PROPS_TYPE}`
    }

    // Generate props serialization for hydration (for components with props)
    // Only serialize props that the client JS init function actually reads
    const clientUsedProps = new Set(ir.metadata.clientAnalysis?.usedProps ?? [])
    const needsInit = ir.metadata.clientAnalysis?.needsInit ?? false
    const propsToSerialize = ir.metadata.propsParams.filter(p => {
      // Skip function props and internal props
      return !p.name.startsWith('on') && !p.name.startsWith('__') && clientUsedProps.has(p.name)
    })
    const hasPropsToSerialize = propsToSerialize.length > 0 && hasClientInteractivity && needsInit

    // Check if root is an if-statement (early return pattern)
    const isIfStatement = ir.root.type === 'if-statement'

    // Generate JSX body (for non-if-statement roots)
    // Pass isRootOfClientComponent flag when the root is a component and this is a client component
    // This ensures the child component receives __instanceId instead of __bfScope
    const isRootComponent = ir.root.type === 'component'

    // currentComponentHasProps: true when we need to emit bf-p on the root element.
    // This is needed when: (1) the component has its own props to serialize, OR
    // (2) the component's root is a component and it's a client component (namespaced props pass-through)
    this.currentComponentHasProps = hasPropsToSerialize || (hasClientInteractivity && isRootComponent)
    let jsxBody = isIfStatement ? '' : this.renderNode(ir.root, {
      isRootOfClientComponent: hasClientInteractivity && isRootComponent
    })

    // Component roots of client components need comment-based scope markers.
    // Unlike element roots (which get bf-s directly), the root component is
    // a plain function whose output has no hydration markers.
    if (!isIfStatement && hasClientInteractivity && isRootComponent) {
      jsxBody = this.wrapWithScopeComment(jsxBody)
    }

    // For if-statement roots, render branches early so they're included in reference analysis
    const ifCode = isIfStatement
      ? this.renderIfStatement(ir.root as IRIfStatement, { isRootOfClientComponent: true })
      : ''

    // Generate signal initializers with unused-aware prefixing (needs jsxBody for reference analysis)
    const fullBodyText = jsxBody + '\n' + ifCode
    const signalInits = this.generateSignalInitializers(ir, fullBodyText)

    // Determine which hydration params are actually used in the generated body
    // Include scopeId line content for accurate reference checking
    const scopeIdLine = hasClientInteractivity
      ? `__instanceId`
      : `__bfScope || __instanceId`
    const bodyRefText = [
      fullBodyText,
      signalInits,
      scopeIdLine,
      // Props serialization references __bfParentProps
      (hasPropsToSerialize || (hasClientInteractivity && isRootComponent)) ? '__bfParentProps' : '',
    ].join('\n')

    // Rebuild hydration props with _ prefix for unused ones
    const bfScopeAlias = /\b__bfScope\b/.test(bodyRefText) ? '__bfScope' : '__bfScope: _bfScope'
    const bfChildAlias = /\b__bfChild\b/.test(bodyRefText) ? '__bfChild' : '__bfChild: _bfChild'
    const bfParentPropsAlias = /\b__bfParentProps\b/.test(bodyRefText) ? '__bfParentProps' : '__bfParentProps: _bfParentProps'
    const bfParentAlias = /\b__bfParent\b/.test(bodyRefText) ? '__bfParent' : '__bfParent: _bfParent'
    const bfMountAlias = /\b__bfMount\b/.test(bodyRefText) ? '__bfMount' : '__bfMount: _bfMount'
    const dataKeyAlias = /\b__dataKey\b/.test(bodyRefText) ? '"data-key": __dataKey' : '"data-key": _dataKey'

    if (propsObjectName) {
      propsExtraction = `  const { __instanceId, ${bfScopeAlias}, ${bfChildAlias}, ${bfParentPropsAlias}, ${bfParentAlias}, ${bfMountAlias}, ${dataKeyAlias}, ...${propsObjectName} } = __allProps`
    } else {
      const hydrationProps = `__instanceId, ${bfScopeAlias}, ${bfChildAlias}, ${bfParentPropsAlias}, ${bfParentAlias}, ${bfMountAlias}, ${dataKeyAlias}`
      const parts: string[] = []
      const propsParams = ir.metadata.propsParams
        .map((p: ParamInfo) => {
          const paramName = p.name === 'class' ? 'className' : p.name
          return p.defaultValue ? `${paramName} = ${p.defaultValue}` : paramName
        })
        .join(', ')
      if (propsParams) {
        parts.push(propsParams)
      }
      parts.push(hydrationProps)
      const restPropsName = ir.metadata.restPropsName
      if (restPropsName) {
        parts.push(`...${restPropsName}`)
      }
      fullPropsDestructure = `{ ${parts.join(', ')} }`
    }

    // Default the props param to `{}` when the component has no required
    // props, so a bare no-arg call (`Foo()`) doesn't crash on destructuring
    // `undefined`. This makes a JSX-returning arrow hoisted from an
    // object-literal value (e.g. `THEME_LOGOS[id]()`) renderable at SSR
    // (#1663). `hasRequiredProps` ignores props that carry a destructuring
    // default, but the declared props type may still mark that field
    // required — so a bare `= {}` would fail `tsc`. Assert the default to the
    // param's own annotated type (`{} as T`); the destructuring defaults
    // supply the values at runtime. The SolidJS-style (`propsObjectName`)
    // branch opts in whenever the annotation is satisfiable by `{} as T`.
    const hasRequiredProps = ir.metadata.propsParams.some(
      (p: ParamInfo) => !p.optional && p.defaultValue === undefined && !p.isRest,
    )
    const wantsNoArgDefault = propsObjectName ? !propsTypeName : !hasRequiredProps
    const propsTypeExpr = typeAnnotation.replace(/^:\s*/, '')
    const noArgDefault = wantsNoArgDefault ? ` = {} as ${propsTypeExpr}` : ''

    const lines: string[] = []
    // Module-export keyword belongs to the adapter: it knows the target language
    // and whether the source declared the component as exported.
    const exportPrefix = ir.metadata.isExported === false ? '' : 'export '
    lines.push(`${exportPrefix}function ${name}(${fullPropsDestructure}${typeAnnotation}${noArgDefault}) {`)

    // Add props extraction for SolidJS-style pattern
    if (propsExtraction) {
      lines.push(propsExtraction)
    }

    // Generate scope ID
    if (hasClientInteractivity) {
      // Interactive components always generate their own unique ID with component name prefix
      // This ensures client JS query `[bf-s^="ComponentName_"]` matches
      lines.push(`  const __scopeId = __instanceId || \`${name}_\${Math.random().toString(36).slice(2, 8)}\``)
    } else {
      // Non-interactive components can inherit parent's scope or use fallback
      lines.push(`  const __scopeId = __bfScope || __instanceId || \`${name}_\${Math.random().toString(36).slice(2, 8)}\``)
    }

    if (signalInits) {
      lines.push(signalInits)
    }

    // Generate props serialization code (flat format)
    // Only the outermost component reads bf-p via hydrate(); children get props via initChild().
    if (hasPropsToSerialize) {
      lines.push('')
      lines.push(`  // Serialize props for client hydration`)
      lines.push(`  const __hydrateProps: Record<string, unknown> = {}`)
      for (const p of propsToSerialize) {
        // Skip functions and JSX elements (they can't be JSON serialized)
        // Use propsObjectName.propName for SolidJS-style, direct propName for destructured
        const propAccess = propsObjectName ? `${propsObjectName}.${p.name}` : p.name
        lines.push(`  if (typeof ${propAccess} !== 'function' && !(typeof ${propAccess} === 'object' && ${propAccess} !== null && 'isEscaped' in ${propAccess})) __hydrateProps['${p.name}'] = ${propAccess}`)
      }
      lines.push(`  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)`)
    } else if (hasClientInteractivity && isRootComponent) {
      // No own props, but root is a component — pass through parent's props
      lines.push('')
      lines.push(`  const __bfPropsJson = __bfParentProps`)
    }

    lines.push('')

    // Handle if-statement roots (early return pattern)
    if (isIfStatement) {
      lines.push(ifCode)
      lines.push(`}`)
      return lines.join('\n')
    }

    lines.push(`  return (`)
    lines.push(`    ${jsxBody}`)
    lines.push(`  )`)
    lines.push(`}`)

    return lines.join('\n')
  }

  // ===========================================================================
  // Node Rendering
  // ===========================================================================

  /**
   * Public entry point for node rendering. Delegates to the shared
   * `IRNodeEmitter` dispatcher (#1290 step 1); per-kind logic lives in
   * the `IRNodeEmitter` methods below.
   */
  renderNode(node: IRNode, ctx?: HonoRenderCtx): string {
    return emitIRNode<HonoRenderCtx>(node, this, ctx ?? {})
  }

  // ===========================================================================
  // IRNodeEmitter implementation (Hono JSX)
  // ===========================================================================

  emitElement(node: IRElement, ctx: HonoRenderCtx, _emit: EmitIRNode<HonoRenderCtx>): string {
    return this.renderElement(node, ctx)
  }

  emitText(node: IRText): string {
    return this.renderText(node)
  }

  emitExpression(node: IRExpression): string {
    return this.renderExpression(node)
  }

  emitConditional(node: IRConditional, ctx: HonoRenderCtx, _emit: EmitIRNode<HonoRenderCtx>): string {
    return this.renderConditional(node, ctx)
  }

  emitLoop(node: IRLoop, _ctx: HonoRenderCtx, _emit: EmitIRNode<HonoRenderCtx>): string {
    return this.renderLoop(node)
  }

  emitComponent(node: IRComponent, ctx: HonoRenderCtx, _emit: EmitIRNode<HonoRenderCtx>): string {
    return this.renderComponent(node, ctx)
  }

  emitFragment(node: IRFragment, _ctx: HonoRenderCtx, _emit: EmitIRNode<HonoRenderCtx>): string {
    return this.renderFragment(node)
  }

  emitSlot(_node: IRSlot): string {
    return '{children}'
  }

  emitIfStatement(_node: IRIfStatement, _ctx: HonoRenderCtx, _emit: EmitIRNode<HonoRenderCtx>): string {
    // If-statements are rendered at the component level (early-return pattern),
    // never inline. This arm is unreachable in practice but is required by
    // the IRNodeEmitter exhaustiveness contract.
    return ''
  }

  emitProvider(node: IRProvider, _ctx: HonoRenderCtx, _emit: EmitIRNode<HonoRenderCtx>): string {
    const children = this.renderChildren(node.children)
    // Quote literal values; expression / template / spread variants emit
    // their JS source verbatim into the Hono JSX output.
    const valueExpr = (() => {
      const v = node.valueProp.value
      switch (v.kind) {
        case 'literal': return JSON.stringify(v.value)
        case 'expression':
        case 'spread': return v.expr
        case 'template': return this.renderTemplateLiteralParts(v.parts)
        case 'boolean-attr':
        case 'boolean-shorthand': return 'true'
        case 'jsx-children': return 'undefined'
      }
    })()
    // Bridge BarefootJS Context to Hono's per-render context stack so
    // descendants that call useContext() at SSR see the provided value.
    // `provideContextSSR` is a helper exported from the client shim
    // (`@barefootjs/hono/client-shim`); generateImports auto-injects the
    // import when this expression is present in the rendered output.
    // The outer fragment makes the form valid JSX whether the provider
    // appears as the component root or nested inside JSX siblings.
    return `<>{provideContextSSR(${node.contextName}, ${valueExpr}, <>${children}</>)}</>`
  }

  emitAsync(node: IRAsync, _ctx: HonoRenderCtx, _emit: EmitIRNode<HonoRenderCtx>): string {
    return this.renderAsync(node)
  }

  renderElement(element: IRElement, ctx?: { isLoopItemRoot?: boolean }): string {
    const tag = element.tag
    const attrs = this.renderAttributes(element)
    const children = this.renderChildren(element.children)

    // Add hydration markers
    let hydrationAttrs = ''
    if (element.needsScope) {
      // Hydration markers (see spec/compiler.md "Slot identity"):
      //   bf-s = addressable scope id
      //   bf-h / bf-m = slot identity of a child scope
      //   bf-r = root-of-client-component marker
      //   bf-p = serialized props (root only; children receive props via initChild)
      hydrationAttrs += ` ${BF_SCOPE}={__scopeId}`
      hydrationAttrs += ` {...(__bfParent ? { "${BF_HOST}": __bfParent } : {})}`
      hydrationAttrs += ` {...(__bfMount ? { "${BF_AT}": __bfMount } : {})}`
      hydrationAttrs += ` {...(!__bfChild ? { "${BF_ROOT}": "" } : {})}`
      if (this.currentComponentHasProps) {
        hydrationAttrs += ` {...(!__bfChild && __bfPropsJson ? { "${BF_PROPS}": __bfPropsJson } : {})}`
      }
      // Add data-key for list reconciliation (only on root elements with scope)
      hydrationAttrs += ' {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}'
    }
    // Add data-key-N for loop items so event delegation can identify inner items
    if (ctx?.isLoopItemRoot && this.loopKeyStack.length > 0) {
      const loop = this.loopKeyStack[this.loopKeyStack.length - 1]
      if (loop.key) {
        const keyAttrName = this.loopKeyStack.length === 1 ? 'data-key' : `data-key-${this.loopKeyStack.length - 1}`
        hydrationAttrs += ` ${keyAttrName}={String(${loop.key})}`
      }
    }
    if (element.slotId) {
      hydrationAttrs += ` bf="${element.slotId}"`
    }
    if (element.regionId) {
      hydrationAttrs += ` ${BF_REGION}="${element.regionId}"`
    }

    if (children) {
      return `<${tag}${attrs}${hydrationAttrs}>${children}</${tag}>`
    } else {
      return `<${tag}${attrs}${hydrationAttrs} />`
    }
  }

  private renderText(text: IRText): string {
    // IRText carries the entity-DECODED value (Phase 1 decodes JSX
    // character references). Re-encode for JSX SOURCE text: the shared
    // HTML escape covers `< > & "` (the JSX parser decodes them right
    // back; raw `'` is legal JSX text), and `{`/`}` — JSX expression delimiters with no named
    // entity — go numeric. Rendering then re-escapes with Hono's own
    // set, so output bytes match the pre-decode pipeline.
    return escapeHtml(text.value).replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')
  }

  renderExpression(expr: IRExpression): string {
    // Keep null as 'null' for proper JSX rendering
    if (expr.expr === 'null' || expr.expr === 'undefined') {
      return 'null'
    }
    // Handle @client directive - render comment marker for client-side evaluation
    if (expr.clientOnly && expr.slotId) {
      return `{bfComment("client:${expr.slotId}")}`
    }
    // Mark expressions with slotId using comment nodes for client JS to find.
    // This includes reactive expressions AND loop-param-dependent expressions
    // (which become reactive via per-item signals on the client).
    if (expr.slotId) {
      return `{bfText("${expr.slotId}")}{${expr.expr}}{bfTextEnd()}`
    }
    return `{${expr.expr}}`
  }

  renderConditional(cond: IRConditional, ctx?: HonoRenderCtx): string {
    // Handle @client directive - render comment markers for client-side evaluation
    if (cond.clientOnly && cond.slotId) {
      return `{bfComment("cond-start:${cond.slotId}")}{bfComment("cond-end:${cond.slotId}")}`
    }

    // A conditional that is itself a loop item root (#1665 whole-item
    // conditional: `arr.map(t => cond && <li/>)`) makes its branch element the
    // loop item's root, so the `data-key` that reconciliation/hydration expect
    // belongs on that element — exactly like a non-conditional loop root. Pass
    // the flag through so `renderElement` emits `data-key`, matching the Go /
    // CSR adapters' generic `key`→`data-key` rewrite.
    const branchCtx: HonoRenderCtx | undefined = ctx?.isLoopItemRoot ? { isLoopItemRoot: true } : undefined
    const whenTrue = this.renderNodeRawCtx(cond.whenTrue, branchCtx)
    let whenFalse = this.renderNodeRawCtx(cond.whenFalse, branchCtx)

    // Handle empty/null whenFalse
    if (!whenFalse || whenFalse === '' || whenFalse === 'null') {
      whenFalse = 'null'
    }

    // If reactive, wrap with markers
    if (cond.slotId) {
      const trueWithMarker = this.wrapWithCondMarker(cond.whenTrue, whenTrue, cond.slotId)
      // For null false branch, render comment markers so client can insert content later
      const falseWithMarker = cond.whenFalse.type === 'expression' && cond.whenFalse.expr === 'null'
        ? `<>{bfComment("cond-start:${cond.slotId}")}{bfComment("cond-end:${cond.slotId}")}</>`
        : this.wrapWithCondMarker(cond.whenFalse, whenFalse, cond.slotId)

      return `{${cond.condition} ? ${trueWithMarker} : ${falseWithMarker}}`
    }

    return `{${cond.condition} ? ${whenTrue} : ${whenFalse}}`
  }

  /**
   * Like the base `renderNodeRaw`, but threads a render ctx through to
   * `renderNode` so a conditional branch can mark its element as a loop item
   * root (#1665). The `null` / `undefined` expression branch carries no
   * element, so it short-circuits exactly as the base helper does.
   */
  private renderNodeRawCtx(node: IRNode, ctx?: HonoRenderCtx): string {
    if (node.type === 'expression') {
      if (node.expr === 'null' || node.expr === 'undefined') return 'null'
      return node.expr
    }
    return this.renderNode(node, ctx)
  }

  private wrapWithCondMarker(node: IRNode, content: string, condId: string): string {
    // Components don't reliably forward bf-c to their root element.
    // Use comment markers so insert() can find them via TreeWalker.
    // This matches the client-side template behavior (renderChild returns
    // ${...} expressions which also get comment-wrapped by addCondAttrToTemplate).
    if (node.type === 'component') {
      return `<>{bfComment("cond-start:${condId}")}${content}{bfComment("cond-end:${condId}")}</>`
    }

    // If content is a single raw HTML element, add bf-c attribute.
    // For fragments (multiple sibling elements), use comment markers.
    if (content.startsWith('<') && node.type !== 'fragment') {
      const match = content.match(/^<(\w+)/)
      if (match) {
        return content.replace(`<${match[1]}`, `<${match[1]} bf-c="${condId}"`)
      }
    }

    // Expression node: wrap in braces for valid JSX
    if (node.type === 'expression') {
      return `<>{bfComment("cond-start:${condId}")}{${content}}{bfComment("cond-end:${condId}")}</>`
    }

    // Text node or other: output as text
    return `<>{bfComment("cond-start:${condId}")}${content}{bfComment("cond-end:${condId}")}</>`
  }

  renderLoop(loop: IRLoop): string {
    // clientOnly loops must not render items at SSR time, but must still emit
    // <!--bf-loop:<id>--><!--bf-/loop:<id>--> boundary markers so that mapArray()
    // on the client can locate the correct anchor node when inserting items.
    // Without the markers, mapArray() resolves anchor = null and appends new
    // elements after sibling markers (e.g. <!--bf-cond-start-->). (#872)
    // The marker id disambiguates sibling `.map()` calls under the same
    // parent (#1087).
    if (loop.clientOnly) {
      return `{bfComment('loop:${loop.markerId}')}{bfComment('/loop:${loop.markerId}')}`
    }

    // Preserve type annotations for loop params in .tsx output
    const paramAnnotation = loop.paramType ? `: ${loop.paramType}` : ''
    const indexAnnotation = loop.indexType ? `: ${loop.indexType}` : ''
    const indexParam = loop.index ? `, ${loop.index}${indexAnnotation}` : ''
    // Push loop key info for data-key attribute generation on loop items
    this.loopKeyStack.push({ key: loop.key, param: loop.param })
    // Render children with isInsideLoop flag so components generate their own scope IDs
    const children = this.renderChildrenInLoop(loop.children)
    this.loopKeyStack.pop()

    let mapExpr: string
    // Use typed mapPreamble when available to preserve type annotations in .tsx output
    const preamble = loop.typedMapPreamble ?? loop.mapPreamble
    // When the rendered children are a JSX expression-container (e.g. a single
    // ternary `{cond ? <A/> : <B/>}` from renderConditional), they cannot be
    // used directly as an arrow body — `(x) => {…}` is parsed as a block
    // statement and the function returns undefined. Wrap with a fragment so
    // the body is unambiguously a JSX expression.
    let safeChildren = children.startsWith('{') ? `<>${children}</>` : children
    // Multi-root Fragment items (#1212): prepend a per-item start marker so
    // mapArray can pair each key with all of its DOM nodes. Wrap the body
    // in a Fragment so the prefix and the existing children share an arrow
    // expression body.
    if (loop.bodyIsMultiRoot) {
      // Per-item start marker: BF_LOOP_ITEM ('bf-loop-i'). Hardcoded
      // literal here to match the adapter's existing convention of
      // emitting comment-marker strings directly.
      safeChildren = `<>{bfComment('bf-loop-i')}${children}</>`
    } else if (loop.bodyIsItemConditional && loop.key) {
      // Whole-item conditional (#1665): a per-item `<!--bf-loop-i:KEY-->`
      // anchor that is ALWAYS present (even when the item's conditional
      // renders nothing), carrying the key so the client's
      // `mapArrayAnchored` can hydrate every SSR-rendered item by its anchor.
      // `bfComment(k)` emits `<!--bf-${k}-->`, so the `loop-i:` argument
      // yields `<!--bf-loop-i:KEY-->`.
      safeChildren = `<>{bfComment('loop-i:' + String(${loop.key}))}${children}</>`
    }
    // Apply chained `.sort()` / `.filter()` extracted to
    // `loop.sortComparator` / `loop.filterPredicate` (#1448 Tier B).
    // Pre-Tier-B this used `loop.array` directly — fine when an
    // SSR-side adapter (Go's `bf_sort`) applied the sort separately,
    // broken on Hono where the emitted JSX is the source of truth
    // for both SSR (runtime-eval) and CSR (template fallback).
    // `.toSorted` (non-mutating) preserves shared prop arrays across
    // renders — `.sort()` here would reorder `_p.items` in place.
    let chainedArray = applyHonoLoopChain(loop)
    const iterMethod = loop.method ?? 'map'

    // Re-emit `.entries()` / `.keys()` / `.values()` for Hono's runtime
    // JS evaluation. The IR stripped the iterator call and synthesised
    // param/index, so we reconstruct proper JS: `[...arr.entries()]`
    // (spread into an array so `.map()` works).
    let callbackParam: string
    if (loop.iterationShape === 'entries' && loop.index) {
      chainedArray = `[...${chainedArray}.entries()]`
      callbackParam = `([${loop.index}${indexAnnotation}, ${loop.param}${paramAnnotation}])`
    } else if (loop.iterationShape === 'keys') {
      chainedArray = `[...${chainedArray}.keys()]`
      callbackParam = `(${loop.param}${paramAnnotation})`
    } else {
      callbackParam = `(${loop.param}${paramAnnotation}${indexParam})`
    }

    if (loop.flatMapCallback) {
      // Complex flatMap: use the original raw callback body (preserves JSX
      // for Hono's runtime JSX evaluation).
      mapExpr = `{${chainedArray}.flatMap(${loop.flatMapCallback.params} => ${loop.flatMapCallback.rawBody})}`
    } else if (preamble) {
      mapExpr = `{${chainedArray}.${iterMethod}(${callbackParam} => { ${preamble} return ${safeChildren} })}`
    } else {
      mapExpr = `{${chainedArray}.${iterMethod}(${callbackParam} => ${safeChildren})}`
    }
    // Wrap with loop boundary markers so reconciliation doesn't affect siblings.
    // bfComment('loop:<id>') → <!--bf-loop:<id>-->. The marker id is unique
    // per loop call site so sibling `.map()` calls under the same parent
    // get their own reconciliation range (#1087).
    return `{bfComment('loop:${loop.markerId}')}${mapExpr}{bfComment('/loop:${loop.markerId}')}`
  }

  private renderChildrenInLoop(children: IRNode[]): string {
    return children.map((child) => this.renderNode(child, { isInsideLoop: true, isLoopItemRoot: true })).join('')
  }

  /**
   * Render an if-statement chain as function-level code.
   * This is used for components with early return patterns.
   */
  renderIfStatement(ifStmt: IRIfStatement, ctx?: { isRootOfClientComponent?: boolean }): string {
    const lines: string[] = []

    // Generate scope variables declared in this if block. The Hono SSR
    // template is a `.tsx` file checked by tsc, so prefer the typed
    // initializer when present to keep `as <T>` casts intact — without
    // them, an emitted `const Tag = children.tag` (cast lost) raises
    // TS2604 at `<Tag/>` because `unknown` has no call signature. See
    // IRIfStatement.scopeVariables.typedInitializer docstring (#1453).
    for (const v of ifStmt.scopeVariables) {
      const init = (this.jsxConfig.preserveTypes && v.typedInitializer) || v.initializer
      lines.push(`    const ${v.name} = ${init}`)
    }

    // Render the consequent (then branch) JSX
    const consequent = this.renderNode(ifStmt.consequent, ctx)

    // Build the if statement
    lines.unshift(`  if (${ifStmt.condition}) {`)
    lines.push(`    return (`)
    lines.push(`      ${consequent}`)
    lines.push(`    )`)
    lines.push(`  }`)

    // Handle the alternate (else branch)
    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        // else if chain - recursively render
        const elseIfCode = this.renderIfStatement(ifStmt.alternate as IRIfStatement, ctx)
        // Replace the leading 'if' with 'else if'
        lines.push(elseIfCode.replace(/^\s*if/, '  else if'))
      } else {
        // Final else branch with regular JSX
        const alternate = this.renderNode(ifStmt.alternate, ctx)
        lines.push(`  return (`)
        lines.push(`    ${alternate}`)
        lines.push(`  )`)
      }
    } else {
      // No alternate - return null
      lines.push(`  return null`)
    }

    return lines.join('\n')
  }

  override renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    // Wrap the streaming body in an ErrorBoundary so a synchronous throw or
    // a rejected Promise during async resolution falls back to the same
    // `fallback` instead of aborting the stream / leaking an unhandled
    // rejection. Mirrors the runtime `BfAsync` component (#1375).
    //
    // Both tags use `__Bf`-prefixed aliases (see the import injection above)
    // so they can't collide with a user component named `Suspense` /
    // `ErrorBoundary` in the same module.
    return (
      `<__BfErrorBoundary fallback={<>${fallback}</>}>` +
      `<__BfSuspense fallback={<>${fallback}</>}>${children}</__BfSuspense>` +
      `</__BfErrorBoundary>`
    )
  }

  renderComponent(comp: IRComponent, ctx?: { isRootOfClientComponent?: boolean; isInsideLoop?: boolean; isLoopItemRoot?: boolean }): string {
    const props = this.renderComponentProps(comp)
    const children = this.renderChildren(comp.children)

    // Determine how to pass scope to child component
    let scopeAttr: string
    // Mark child components with slotId for parent-first hydration
    // Add __bfChild when parent has client interactivity (will call initChild)
    const bfChildAttr = (comp.slotId && this.hasClientInteractivity) ? ' __bfChild={true}' : ''
    // Pass parent scope + slot id to the child so it can stamp bf-h / bf-m
    // for upsertChild's (bf-h, bf-m) primary lookup (#1249).
    const bfMountAttr = comp.slotId ? ` __bfParent={__scopeId} __bfMount={'${comp.slotId}'}` : ''
    if (ctx?.isRootOfClientComponent) {
      // Root component: if it has a slotId, include it so client JS can find it
      // with [bf-s$="_sX"] selector. Otherwise pass parent's scope directly.
      // Note: Do NOT add __bfChild here - the root is the main hydration target, not a child.
      // Pass __bfParentProps so child component can use parent's serialized props
      const propsPassAttr = this.currentComponentHasProps ? ' __bfParentProps={__bfPropsJson}' : ''
      if (comp.slotId) {
        scopeAttr = ` __instanceId={\`\${__scopeId}_${comp.slotId}\`}${propsPassAttr}${bfMountAttr}`
      } else {
        scopeAttr = ` __instanceId={__scopeId}${propsPassAttr}`
      }
      // Also pass bf-s for asChild/Slot patterns where the component
      // forwards props to a DOM element via {...props}.
      scopeAttr += ` ${BF_SCOPE}={__scopeId}`
    } else if (ctx?.isInsideLoop) {
      // Components inside loops should generate their own unique scope IDs
      // Pass __bfScope so they use it as fallback but generate unique IDs
      // This ensures each loop iteration has a distinct component instance
      if (comp.slotId) {
        scopeAttr = ` __bfScope={\`\${__scopeId}_${comp.slotId}\`}${bfChildAttr}${bfMountAttr}`
      } else {
        scopeAttr = ' __bfScope={__scopeId}'
      }
    } else if (comp.slotId) {
      // Components with slotId need unique scope with slot suffix
      // Format: ParentName_slotX for client JS matching
      scopeAttr = ` __instanceId={\`\${__scopeId}_${comp.slotId}\`}${bfChildAttr}${bfMountAttr}`
    } else {
      // Non-interactive components inherit parent's scope
      scopeAttr = ' __instanceId={__scopeId}'
    }

    if (children) {
      return `<${comp.name}${props}${scopeAttr}>${children}</${comp.name}>`
    } else {
      return `<${comp.name}${props}${scopeAttr} />`
    }
  }

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      return this.wrapWithScopeComment(children)
    }
    return `<>${children}</>`
  }

  /**
   * Wrap `body` in a fragment-rooted scope comment.
   * Shape (matches `hydrate.ts::hydrateCommentScope`):
   *   root:  <!--bf-scope:<scopeId>|<propsJson>-->
   *   child: <!--bf-scope:<scopeId>|h=<host>|m=<slot>|<propsJson>-->
   * `<scopeId>` stays at the front so child detection can anchor on `|h=`.
   */
  private wrapWithScopeComment(body: string): string {
    const hostExpr = '${__bfParent ? `|h=${__bfParent}|m=${__bfMount}` : ""}'
    const propsExpr = this.currentComponentHasProps
      ? '${__bfPropsJson ? `|${__bfPropsJson}` : ""}'
      : ''
    return `<>{bfComment(\`scope:\${__scopeId}${hostExpr}${propsExpr}\`)}${body}</>`
  }

  // ===========================================================================
  // Attribute Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for intrinsic-element attributes (Hono JSX).
   * Per-kind logic that used to live in a `switch (v.kind)` inside
   * `renderAttributes`; routed through the shared dispatcher so a new
   * AttrValue kind becomes a TS compile error here (#1290 step 2).
   */
  private readonly elementAttrEmitter: AttrValueEmitter = {
    // The decoded static value re-encodes for the JSX attr string (the
    // JSX parser decodes entities in quoted attribute values, so the
    // runtime sees the decoded string and escapes it on render).
    emitLiteral: (value, name) => `${name}="${escapeHtml(value.value)}"`,
    emitExpression: (value, name) => {
      // Boolean attrs / presence-folded expressions: pass `undefined` when
      // falsy so Hono omits the attribute. Wrap in parens to keep `??`
      // operators inside `expr` from breaking the surrounding `|| undefined`.
      if (isBooleanAttr(name) || value.presenceOrUndefined) {
        return `${name}={(${value.expr}) || undefined}`
      }
      return `${name}={${value.expr}}`
    },
    emitBooleanAttr: (_value, name) => name,
    emitBooleanShorthand: () => '',
    emitTemplate: (value, name) => `${name}={${this.renderTemplateLiteralParts(value.parts)}}`,
    emitSpread: (value) => `{...${value.expr}}`,
    // Neither boolean-shorthand nor jsx-children is legal on intrinsic
    // elements. Returning empty string drops the entry silently — matches
    // pre-#1290 behavior.
    emitJsxChildren: () => '',
  }

  /**
   * AttrValue lowering for component-invocation props (Hono JSX).
   * Component props differ from intrinsic attrs in several places —
   * `jsx-children` is rendered as `<>…</>`, `expression` skips the
   * boolean-attr fold, etc. Kept as a separate emitter so each method
   * does one thing.
   */
  private readonly componentPropEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) =>
      // IR-authoritative string literal: `<X fill="var(--c)" />`.
      // Emitting as a plain JSX attr string (not a JS expression) is what
      // distinguishes a CSS-shaped value (`var(...)`, `url(...)`,
      // `calc(...)`) from a JS expression. The decoded value re-encodes
      // so the JSX parser hands the component the same decoded string.
      `${name}="${escapeHtml(value.value)}"`,
    emitExpression: (value, name) => `${name}={${value.expr}}`,
    emitBooleanAttr: (_value, name) => name,
    emitBooleanShorthand: (_value, name) => name,
    emitTemplate: (value, name) => `${name}={${this.renderTemplateLiteralParts(value.parts)}}`,
    emitSpread: (value) => `{...${value.expr}}`,
    emitJsxChildren: (value, name) => {
      const rendered = value.children.map((c) => this.renderNode(c)).join('')
      return `${name}={<>${rendered}</>}`
    },
  }

  private renderAttributes(element: IRElement): string {
    const parts: string[] = []

    for (const attr of element.attrs) {
      // `/* @client */` attribute bindings are deferred to hydrate: the
      // client runtime sets/patches the attribute in a mount effect (the
      // CSR template omits it; ir-to-client-js emits the setAttribute
      // effect). Skip SSR emission so the server omits the attribute,
      // matching the client-deferred shape and avoiding a hydration
      // mismatch where the server renders an attribute the client would
      // re-derive on mount. #1966
      if (attr.clientOnly) continue
      // The IR carries the canonical HTML attribute name (#2172:
      // `processAttributes` normalizes `className`→`class`, `htmlFor`→
      // `for`, camelCase aliases → lowercase). This adapter's target
      // language is JSX typed against `@barefootjs/jsx` html-types,
      // whose vocabulary is those same lowercase HTML names with ONE
      // JSX-ism: `className` (`class?: never`, #773). Map it back at
      // emit — the JSX-language equivalent of Go emitting `{{.X}}`.
      const jsxName = attr.name === 'class' ? 'className' : attr.name
      const lowered = emitAttrValue(attr.value, this.elementAttrEmitter, jsxName)
      if (lowered) parts.push(lowered)
    }

    // Add event handlers (as no-op for SSR)
    for (const event of element.events) {
      const handlerName = event.originalAttr ?? `on${event.name.charAt(0).toUpperCase()}${event.name.slice(1)}`
      parts.push(`${handlerName}={() => {}}`)
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
  }

  private renderComponentProps(comp: IRComponent): string {
    const parts: string[] = []
    let keyValue: string | null = null

    for (const prop of comp.props) {
      if (prop.name === 'key') {
        // JSX key → data-key only. Hono JSX strips `key` from HTML output
        // (delete props["key"]), so emitting key={} is a no-op. We only need
        // data-key which the BarefootJS client runtime uses for reconciliation.
        keyValue = this.attrValueToJsExpr(prop.value)
        continue
      }
      const lowered = emitAttrValue(prop.value, this.componentPropEmitter, prop.name)
      if (lowered) parts.push(lowered)
    }

    // Add data-key prop when key is present for client-side reconciliation
    // This allows the child component to add data-key attribute to its root element
    if (keyValue) {
      parts.push(`data-key={${keyValue}}`)
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
  }

  private attrValueToJsExpr(value: AttrValue): string {
    switch (value.kind) {
      case 'literal': return JSON.stringify(value.value)
      case 'expression':
      case 'spread': return value.expr
      case 'template': return this.renderTemplateLiteralParts(value.parts)
      case 'boolean-shorthand':
      case 'boolean-attr': return 'true'
      case 'jsx-children': return 'undefined'
    }
  }

  private renderTemplateLiteralParts(parts: IRTemplatePart[]): string {
    let output = '`'
    for (const part of parts) {
      if (part.type === 'string') {
        output += part.value
      } else if (part.type === 'ternary') {
        output += `\${${part.condition} ? '${part.whenTrue}' : '${part.whenFalse}'}`
      } else if (part.type === 'lookup') {
        // Hono runs JS at SSR time, so a `${MAP[KEY]}` lookup can be
        // re-materialised as a runtime indexed access against the
        // resolved cases — byte-identical to the client emit path in
        // `ir-to-client-js/utils.ts`. Use `part.key` (raw JS source)
        // because this output runs inside the destructured-prop scope
        // of the component, mirroring the `'ternary'` branch above.
        const obj = '{' + Object.entries(part.cases).map(
          ([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`
        ).join(', ') + '}'
        output += `\${(${obj})[${part.key}]}`
      }
    }
    output += '`'
    return output
  }

}

// Export singleton instance for convenience
export const honoAdapter = new HonoAdapter()
