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
  type IRTemplateLiteral,
  type ParamInfo,
  type AdapterOutput,
  type TemplateSections,
  type JsxAdapterConfig,
  JsxAdapter,
  isBooleanAttr,
} from '@barefootjs/jsx'

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
}

export class HonoAdapter extends JsxAdapter {
  name = 'hono'
  extension = '.tsx'
  clientShimSource = '@barefootjs/hono/client-shim'

  protected jsxConfig: JsxAdapterConfig = { preserveTypes: true }

  private options: HonoAdapterOptions
  private isClientComponent: boolean = false
  private hasClientInteractivity: boolean = false
  private currentComponentHasProps: boolean = false
  /** Stack of loop keys for generating data-key / data-key-1 attributes on loop items */
  private loopKeyStack: Array<{ key: string | null; param: string }> = []

  constructor(options: HonoAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
      clientJsFilename: options.clientJsFilename,
    }
  }

  generate(ir: ComponentIR): AdapterOutput {
    this.componentName = ir.metadata.componentName
    this.isClientComponent = ir.metadata.isClientComponent

    // Generate component body FIRST so we can scan it for used imports
    const component = this.generateComponent(ir)
    const types = this.generateTypes(ir, component)
    const componentCode = [types, component].filter(Boolean).join('\n')
    const baseImports = this.generateImports(ir, componentCode)
    // Module-level Context bindings (`const Ctx = createContext()`) are
    // skipped from the SSR signal-initializer block by JsxAdapter — they
    // need to live at module scope so providers and consumers in the same
    // render share the same Context object identity.
    const moduleConstants = this.generateModuleLevelContextBindings(ir)
    const imports = moduleConstants
      ? `${baseImports}\n\n${moduleConstants}`
      : baseImports

    const defaultExport = ir.metadata.hasDefaultExport
      ? `\nexport default ${this.componentName}`
      : ''

    const sections: TemplateSections = {
      imports,
      types: types || '',
      component,
      defaultExport,
    }

    // Assemble template for backward compat (external consumers using output.template)
    const template = [imports, types, component].filter(Boolean).join('\n\n') + defaultExport

    return {
      template,
      sections,
      types: types || undefined,
      extension: this.extension,
    }
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

    // Import Suspense when async boundaries are used
    if (componentCode.includes('<Suspense')) {
      lines.push(`import { Suspense } from 'hono/jsx/streaming'`)
    }

    // Re-emit template imports (compiler already rewrote @barefootjs/client to
    // the shim source).
    for (const imp of ir.metadata.templateImports) {
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
      const included = new Set<string>()
      // First pass: include types directly referenced in the component body
      for (const typeDef of ir.metadata.typeDefinitions) {
        if (new RegExp(`\\b${typeDef.name}\\b`).test(componentBody)) {
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
    const hasReactivePrimitives =
      ir.metadata.signals.length > 0 ||
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

    if (propsObjectName) {
      // SolidJS-style: function Component(props: Props)
      // Accept all props as a single object, then destructure hydration props out
      fullPropsDestructure = `__allProps`
      typeAnnotation = propsTypeName
        ? `: ${propsTypeName} & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; "data-key"?: string | number }`
        : `: Record<string, unknown> & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; "data-key"?: string | number }`
      // propsExtraction is rebuilt after jsxBody generation with unused-aware aliases
    } else {
      // Destructured props pattern — fullPropsDestructure rebuilt after jsxBody with unused-aware aliases
      fullPropsDestructure = '' // placeholder, rebuilt below
      typeAnnotation = propsTypeName
        ? `: ${name}PropsWithHydration`
        : ': { __instanceId?: string; __bfScope?: string; __bfChild?: boolean }'
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
      const scopeExpr = '${__bfChild ? `~${__scopeId}` : __scopeId}'
      const propsExpr = this.currentComponentHasProps
        ? '${__bfPropsJson ? `|${__bfPropsJson}` : ""}'
        : ''
      jsxBody = `<>{bfComment(\`scope:${scopeExpr}${propsExpr}\`)}${jsxBody}</>`
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
    const dataKeyAlias = /\b__dataKey\b/.test(bodyRefText) ? '"data-key": __dataKey' : '"data-key": _dataKey'

    if (propsObjectName) {
      propsExtraction = `  const { __instanceId, ${bfScopeAlias}, ${bfChildAlias}, ${bfParentPropsAlias}, ${dataKeyAlias}, ...${propsObjectName} } = __allProps`
    } else {
      const hydrationProps = `__instanceId, ${bfScopeAlias}, ${bfChildAlias}, ${bfParentPropsAlias}, ${dataKeyAlias}`
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

    const lines: string[] = []
    // Adapter always emits without 'export'; compiler handles export keywords
    lines.push(`function ${name}(${fullPropsDestructure}${typeAnnotation}) {`)

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

  renderNode(node: IRNode, ctx?: { isRootOfClientComponent?: boolean; isInsideLoop?: boolean; isLoopItemRoot?: boolean }): string {
    switch (node.type) {
      case 'element':
        return this.renderElement(node, ctx)
      case 'text':
        return this.renderText(node)
      case 'expression':
        return this.renderExpression(node)
      case 'conditional':
        return this.renderConditional(node)
      case 'loop':
        return this.renderLoop(node)
      case 'component':
        return this.renderComponent(node, ctx)
      case 'fragment':
        return this.renderFragment(node)
      case 'slot':
        return '{children}'
      case 'if-statement':
        // If-statements are rendered at the component level, not inline
        // This case shouldn't normally be hit, but return empty for safety
        return ''
      case 'provider': {
        const provider = node as IRProvider
        const children = this.renderChildren(provider.children)
        // Quote string-literal values; dynamic expressions emit raw.
        const rawValue = provider.valueProp.value ?? ''
        const valueExpr = provider.valueProp.dynamic ? rawValue : JSON.stringify(rawValue)
        // Bridge BarefootJS Context to Hono's per-render context stack so
        // descendants that call useContext() at SSR see the provided value.
        // `provideContextSSR` is a helper exported from the client shim
        // (`@barefootjs/hono/client-shim`); generateImports auto-injects the
        // import when this expression is present in the rendered output.
        // The outer fragment makes the form valid JSX whether the provider
        // appears as the component root or nested inside JSX siblings.
        return `<>{provideContextSSR(${provider.contextName}, ${valueExpr}, <>${children}</>)}</>`
      }
      case 'async':
        return this.renderAsync(node as IRAsync)
      default:
        return ''
    }
  }

  renderElement(element: IRElement, ctx?: { isLoopItemRoot?: boolean }): string {
    const tag = element.tag
    const attrs = this.renderAttributes(element)
    const children = this.renderChildren(element.children)

    // Add hydration markers
    let hydrationAttrs = ''
    if (element.needsScope) {
      // Use __scopeId which is generated by the component
      hydrationAttrs += ' bf-s={__bfChild ? `~${__scopeId}` : __scopeId}'
      if (this.currentComponentHasProps) {
        // Only emit bf-p on root components (not children).
        // Child components receive props from parent via initChild().
        hydrationAttrs += ' {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})}'
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

    if (children) {
      return `<${tag}${attrs}${hydrationAttrs}>${children}</${tag}>`
    } else {
      return `<${tag}${attrs}${hydrationAttrs} />`
    }
  }

  private renderText(text: IRText): string {
    return text.value
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

  renderConditional(cond: IRConditional): string {
    // Handle @client directive - render comment markers for client-side evaluation
    if (cond.clientOnly && cond.slotId) {
      return `{bfComment("cond-start:${cond.slotId}")}{bfComment("cond-end:${cond.slotId}")}`
    }

    const whenTrue = this.renderNodeRaw(cond.whenTrue)
    let whenFalse = this.renderNodeRaw(cond.whenFalse)

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
    // <!--bf-loop--><!--bf-/loop--> boundary markers so that mapArray() on the
    // client can locate the correct anchor node when inserting items.
    // Without the markers, mapArray() resolves anchor = null and appends new
    // elements after sibling markers (e.g. <!--bf-cond-start-->). (#872)
    if (loop.clientOnly) {
      return `{bfComment('loop')}{bfComment('/loop')}`
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
    const safeChildren = children.startsWith('{') ? `<>${children}</>` : children
    if (preamble) {
      mapExpr = `{${loop.array}.map((${loop.param}${paramAnnotation}${indexParam}) => { ${preamble} return ${safeChildren} })}`
    } else {
      mapExpr = `{${loop.array}.map((${loop.param}${paramAnnotation}${indexParam}) => ${safeChildren})}`
    }
    // Wrap with loop boundary markers so reconciliation doesn't affect siblings.
    // bfComment is a helper that renders an HTML comment in JSX.
    // bfComment('loop') → <!--bf-loop-->, bfComment('/loop') → <!--bf-/loop-->
    return `{bfComment('loop')}${mapExpr}{bfComment('/loop')}`
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

    // Generate scope variables declared in this if block
    for (const v of ifStmt.scopeVariables) {
      lines.push(`    const ${v.name} = ${v.initializer}`)
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

  renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    return `<Suspense fallback={<>${fallback}</>}>${children}</Suspense>`
  }

  renderComponent(comp: IRComponent, ctx?: { isRootOfClientComponent?: boolean; isInsideLoop?: boolean; isLoopItemRoot?: boolean }): string {
    const props = this.renderComponentProps(comp)
    const children = this.renderChildren(comp.children)

    // Determine how to pass scope to child component
    let scopeAttr: string
    // Mark child components with slotId for parent-first hydration
    // Add __bfChild when parent has client interactivity (will call initChild)
    const bfChildAttr = (comp.slotId && this.hasClientInteractivity) ? ' __bfChild={true}' : ''
    if (ctx?.isRootOfClientComponent) {
      // Root component: if it has a slotId, include it so client JS can find it
      // with [bf-s$="_sX"] selector. Otherwise pass parent's scope directly.
      // Note: Do NOT add __bfChild here - the root is the main hydration target, not a child.
      // Pass __bfParentProps so child component can use parent's serialized props
      const propsPassAttr = this.currentComponentHasProps ? ' __bfParentProps={__bfPropsJson}' : ''
      if (comp.slotId) {
        scopeAttr = ` __instanceId={\`\${__scopeId}_${comp.slotId}\`}${propsPassAttr}`
      } else {
        scopeAttr = ` __instanceId={__scopeId}${propsPassAttr}`
      }
      // Also pass bf-s for asChild/Slot patterns where the component forwards
      // props to a DOM element via {...props}. This ensures the final element
      // has bf-s for hydration queries.
      scopeAttr += ' bf-s={__bfChild ? `~${__scopeId}` : __scopeId}'
    } else if (ctx?.isInsideLoop) {
      // Components inside loops should generate their own unique scope IDs
      // Pass __bfScope so they use it as fallback but generate unique IDs
      // This ensures each loop iteration has a distinct component instance
      if (comp.slotId) {
        scopeAttr = ` __bfScope={\`\${__scopeId}_${comp.slotId}\`}${bfChildAttr}`
      } else {
        scopeAttr = ' __bfScope={__scopeId}'
      }
    } else if (comp.slotId) {
      // Components with slotId need unique scope with slot suffix
      // Format: ParentName_slotX for client JS matching
      scopeAttr = ` __instanceId={\`\${__scopeId}_${comp.slotId}\`}${bfChildAttr}`
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
      // Emit comment-based scope marker for fragment roots
      const scopeExpr = '${__bfChild ? `~${__scopeId}` : __scopeId}'
      // Only include props JSON if this component has props to serialize
      const propsExpr = this.currentComponentHasProps
        ? '${__bfPropsJson ? `|${__bfPropsJson}` : ""}'
        : ''
      return `<>{bfComment(\`scope:${scopeExpr}${propsExpr}\`)}${children}</>`
    }
    return `<>${children}</>`
  }

  // ===========================================================================
  // Attribute Rendering
  // ===========================================================================

  private renderAttributes(element: IRElement): string {
    const parts: string[] = []

    for (const attr of element.attrs) {
      const attrName = attr.name

      if (attr.name === '...') {
        // Spread attribute
        parts.push(`{...${attr.value}}`)
      } else if (attr.value === null) {
        // Boolean attribute
        parts.push(attrName)
      } else if (typeof attr.value === 'object' && attr.value.type === 'template-literal') {
        // Template literal with structured ternaries
        const output = this.renderTemplateLiteral(attr.value)
        parts.push(`${attrName}={${output}}`)
      } else if (attr.dynamic) {
        // Dynamic attribute
        if (isBooleanAttr(attrName) || attr.presenceOrUndefined) {
          // Boolean attrs: pass undefined when falsy so Hono omits the attribute
          // Wrap in parentheses to avoid syntax error when value contains ?? operator
          parts.push(`${attrName}={(${attr.value}) || undefined}`)
        } else {
          parts.push(`${attrName}={${attr.value}}`)
        }
      } else {
        // Static attribute
        parts.push(`${attrName}="${attr.value}"`)
      }
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
      if (prop.jsxChildren?.length) {
        // JSX prop: render children inline as JSX fragment
        const rendered = prop.jsxChildren.map(c => this.renderNode(c)).join('')
        parts.push(`${prop.name}={<>${rendered}</>}`)
        continue
      }
      if (prop.name === '...') {
        parts.push(`{...${prop.value}}`)
      } else if (prop.name === 'key') {
        // JSX key → data-key only. Hono JSX strips `key` from HTML output
        // (delete props["key"]), so emitting key={} is a no-op. We only need
        // data-key which the BarefootJS client runtime uses for reconciliation.
        keyValue = prop.value
      } else if (prop.dynamic) {
        parts.push(`${prop.name}={${prop.value}}`)
      } else if (prop.value === 'true') {
        // Boolean true: <Component disabled />
        parts.push(prop.name)
      } else if (prop.value === 'false') {
        // Boolean false: <Component disabled={false} />
        // Note: we output this explicitly rather than omitting it
        // because the child component may need the explicit false value
        parts.push(`${prop.name}={false}`)
      } else if (this.isJsExpression(prop.value)) {
        // JavaScript expressions (arrow functions, etc.)
        parts.push(`${prop.name}={${prop.value}}`)
      } else {
        // String literals
        parts.push(`${prop.name}="${prop.value}"`)
      }
    }

    // Add data-key prop when key is present for client-side reconciliation
    // This allows the child component to add data-key attribute to its root element
    if (keyValue) {
      parts.push(`data-key={${keyValue}}`)
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
  }

  private renderTemplateLiteral(literal: IRTemplateLiteral): string {
    let output = '`'
    for (const part of literal.parts) {
      if (part.type === 'string') {
        output += part.value
      } else if (part.type === 'ternary') {
        output += `\${${part.condition} ? '${part.whenTrue}' : '${part.whenFalse}'}`
      }
    }
    output += '`'
    return output
  }

  private isJsExpression(value: string): boolean {
    // Arrow function: () => ..., (x) => ..., x => ...
    if (/^(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/.test(value)) {
      return true
    }
    // Function call with parentheses: foo(), bar(x)
    if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*\s*\(/.test(value)) {
      return true
    }
    // Function/setter reference: setFoo, handleClick (common naming patterns)
    // These are likely function references, not string values
    if (/^(set[A-Z]|handle[A-Z]|on[A-Z])[a-zA-Z0-9_$]*$/.test(value)) {
      return true
    }
    return false
  }

}

// Export singleton instance for convenience
export const honoAdapter = new HonoAdapter()
