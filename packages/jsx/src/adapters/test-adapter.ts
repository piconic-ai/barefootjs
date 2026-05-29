/**
 * BarefootJS Test Adapter
 *
 * A minimal adapter for testing purposes.
 * Generates simple JSX output without framework-specific features.
 */

import type {
  ComponentIR,
  IRNode,
  IRElement,
  IRText,
  IRExpression,
  IRConditional,
  IRLoop,
  IRComponent,
  IRFragment,
  ParamInfo,
} from '../types'
import type { AdapterOutput, TemplateSections } from './interface'
import { type JsxAdapterConfig, JsxAdapter } from './jsx-adapter'
import { rewriteImportsForTemplate } from './template-imports'

export class TestAdapter extends JsxAdapter {
  name = 'test'
  extension = '.test.tsx'

  protected jsxConfig: JsxAdapterConfig = { preserveTypes: false }

  generate(ir: ComponentIR): AdapterOutput {
    this.componentName = ir.metadata.componentName

    const imports = this.generateImports(ir)
    const types = this.generateTypes(ir)
    const component = this.generateComponent(ir)

    const defaultExport = ir.metadata.hasDefaultExport
      ? `\nexport default ${this.componentName}`
      : ''

    const sections: TemplateSections = {
      imports,
      types: types || '',
      component,
      defaultExport,
    }

    // Assemble template for backward compat
    const template = [imports, types, component].filter(Boolean).join('\n\n') + defaultExport

    return {
      template,
      sections,
      types: types || undefined,
      extension: this.extension,
    }
  }

  private generateImports(ir: ComponentIR): string {
    const lines: string[] = []

    // TestAdapter has no client shim, so client-side packages are dropped.
    const templateImports = rewriteImportsForTemplate(
      ir.metadata.templateImports,
      undefined,
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

    return lines.join('\n')
  }

  generateTypes(ir: ComponentIR): string | null {
    const lines: string[] = []

    for (const typeDef of ir.metadata.typeDefinitions) {
      lines.push(typeDef.definition)
    }

    // Only generate PropsWithHydration when destructured-props pattern uses it
    const propsTypeName = ir.metadata.propsType?.raw
    if (propsTypeName && !ir.metadata.propsObjectName) {
      lines.push('')
      lines.push(`type ${this.componentName}PropsWithHydration = ${propsTypeName} & {`)
      lines.push('  __instanceId?: string')
      lines.push('  __bfScope?: string')
      lines.push('}')
    }

    return lines.length > 0 ? lines.join('\n') : null
  }

  private generateComponent(ir: ComponentIR): string {
    const name = ir.metadata.componentName
    const propsTypeName = ir.metadata.propsType?.raw
    const hasClientInteractivity = ir.metadata.signals.length > 0 ||
      ir.metadata.memos.length > 0

    const typeAnnotation = propsTypeName
      ? `: ${name}PropsWithHydration`
      : ': { __instanceId?: string; __bfScope?: string }'

    const jsxBody = this.renderNode(ir.root)
    const signalInits = this.generateSignalInitializers(ir, jsxBody)

    // Determine which hydration params are used in the generated body
    // Include the scopeId line content for accurate reference checking
    const scopeIdLine = hasClientInteractivity
      ? `(/_s\\d/.test(__bfScope || '') ? __bfScope : null) || __instanceId`
      : `__bfScope || __instanceId`
    const bodyRefText = [jsxBody, signalInits, scopeIdLine].join('\n')
    const bfScopeAlias = /\b__bfScope\b/.test(bodyRefText) ? '__bfScope' : '__bfScope: _bfScope'

    const propsParams = ir.metadata.propsParams
      .map((p: ParamInfo) => (p.defaultValue ? `${p.name} = ${p.defaultValue}` : p.name))
      .join(', ')

    const restPropsName = ir.metadata.restPropsName
    const hydrationProps = `__instanceId, ${bfScopeAlias}`
    const parts: string[] = []
    if (propsParams) {
      parts.push(propsParams)
    }
    parts.push(hydrationProps)
    if (restPropsName) {
      parts.push(`...${restPropsName}`)
    }
    const fullPropsDestructure = `{ ${parts.join(', ')} }`

    // Default the props param to `{}` when the component has no required
    // props, so a bare no-arg call (`Foo()`) doesn't crash on destructuring
    // `undefined`. This is what makes a JSX-returning arrow hoisted from an
    // object-literal value (e.g. `THEME_LOGOS[id]()`) renderable at SSR
    // (#1663). Only safe when no required prop exists — otherwise `{}` would
    // not satisfy the props type.
    const hasRequiredProps = ir.metadata.propsParams.some(
      (p: ParamInfo) => !p.optional && p.defaultValue === undefined && !p.isRest,
    )
    const noArgDefault = hasRequiredProps ? '' : ' = {}'

    const lines: string[] = []
    // Module-export keyword belongs to the adapter: it knows the target language
    // and whether the source declared the component as exported.
    const exportPrefix = ir.metadata.isExported === false ? '' : 'export '
    lines.push(`${exportPrefix}function ${name}(${fullPropsDestructure}${typeAnnotation}${noArgDefault}) {`)

    // Generate scope ID
    if (hasClientInteractivity) {
      // Interactive components: use __bfScope if it contains _sN (means parent passes event handlers)
      // Otherwise, generate unique ID for independent hydration
      lines.push(`  const __scopeId = (/_s\\d/.test(__bfScope || '') ? __bfScope : null) || __instanceId || \`${name}_\${Math.random().toString(36).slice(2, 8)}\``)
    } else {
      // Non-interactive components can inherit parent's scope or use fallback
      lines.push(`  const __scopeId = __bfScope || __instanceId || \`${name}_\${Math.random().toString(36).slice(2, 8)}\``)
    }

    if (signalInits) {
      lines.push(signalInits)
    }

    lines.push('')
    lines.push(`  return (`)
    lines.push(`    ${jsxBody}`)
    lines.push(`  )`)
    lines.push(`}`)

    return lines.join('\n')
  }

  renderNode(node: IRNode): string {
    switch (node.type) {
      case 'element':
        return this.renderElement(node)
      case 'text':
        return (node as IRText).value
      case 'expression':
        return this.renderExpression(node)
      case 'conditional':
        return this.renderConditional(node)
      case 'loop':
        return this.renderLoop(node)
      case 'component':
        return this.renderComponent(node)
      case 'fragment':
        return this.renderFragment(node as IRFragment)
      case 'slot':
        return '{children}'
      default:
        return ''
    }
  }

  renderElement(element: IRElement): string {
    const tag = element.tag
    const attrs = this.renderAttributes(element)
    const children = this.renderChildren(element.children)

    let hydrationAttrs = ''
    if (element.needsScope) {
      hydrationAttrs += ' bf-s={__scopeId}'
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

  renderExpression(expr: IRExpression): string {
    if (expr.expr === 'null' || expr.expr === 'undefined') {
      return 'null'
    }
    if (expr.reactive && expr.slotId) {
      return `{bfText("${expr.slotId}")}{${expr.expr}}{bfTextEnd()}`
    }
    return `{${expr.expr}}`
  }

  renderConditional(cond: IRConditional): string {
    const whenTrue = this.renderNodeRaw(cond.whenTrue)
    let whenFalse = this.renderNodeRaw(cond.whenFalse)

    if (!whenFalse || whenFalse === '' || whenFalse === 'null') {
      whenFalse = 'null'
    }

    return `{${cond.condition} ? ${whenTrue} : ${whenFalse}}`
  }

  renderLoop(loop: IRLoop): string {
    const indexParam = loop.index ? `, ${loop.index}` : ''
    const children = this.renderChildren(loop.children)
    // Wrap with fragment when children start with `{` so the arrow body isn't
    // parsed as a block statement (matches hono-adapter behavior).
    const safeChildren = children.startsWith('{') ? `<>${children}</>` : children

    return `{${loop.array}.map((${loop.param}${indexParam}) => ${safeChildren})}`
  }

  renderComponent(comp: IRComponent): string {
    const props = this.renderComponentProps(comp)
    const children = this.renderChildren(comp.children)

    const scopeAttr = ' __bfScope={__scopeId}'

    if (children) {
      return `<${comp.name}${props}${scopeAttr}>${children}</${comp.name}>`
    } else {
      return `<${comp.name}${props}${scopeAttr} />`
    }
  }

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    return `<>${children}</>`
  }

  private renderAttributes(element: IRElement): string {
    const parts: string[] = []

    for (const attr of element.attrs) {
      const attrName = attr.name === 'class' ? 'className' : attr.name

      switch (attr.value.kind) {
        case 'spread':
          parts.push(`{...${attr.value.expr}}`)
          break
        case 'boolean-attr':
          parts.push(attrName)
          break
        case 'expression':
          parts.push(`${attrName}={${attr.value.expr}}`)
          break
        case 'template':
          parts.push(`${attrName}={${this.flattenTemplate(attr.value)}}`)
          break
        case 'literal':
          parts.push(`${attrName}="${attr.value.value}"`)
          break
        case 'boolean-shorthand':
        case 'jsx-children':
          // Not legal on intrinsic elements; emit nothing.
          break
      }
    }

    for (const event of element.events) {
      const handlerName = event.originalAttr ?? `on${event.name.charAt(0).toUpperCase()}${event.name.slice(1)}`
      parts.push(`${handlerName}={() => {}}`)
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
  }

  private flattenTemplate(value: { kind: string }): string {
    // Simple stringifier for `template`-kind values; tests only need a
    // recognisable JSX shape, not byte-exact reproduction.
    const v = value as { kind: 'template'; parts: import('../types').IRTemplatePart[] }
    return '`' + v.parts.map(p => {
      if (p.type === 'string') return p.value
      if (p.type === 'ternary') return `\${${p.condition} ? '${p.whenTrue}' : '${p.whenFalse}'}`
      return `\${(${JSON.stringify(p.cases)})[${p.key}]}`
    }).join('') + '`'
  }

  private renderComponentProps(comp: IRComponent): string {
    const parts: string[] = []

    for (const prop of comp.props) {
      switch (prop.value.kind) {
        case 'jsx-children': {
          const rendered = prop.value.children.map(c => this.renderNode(c)).join('')
          parts.push(`${prop.name}={<>${rendered}</>}`)
          break
        }
        case 'spread':
          parts.push(`{...${prop.value.expr}}`)
          break
        case 'expression':
          parts.push(`${prop.name}={${prop.value.expr}}`)
          break
        case 'template':
          parts.push(`${prop.name}={${this.flattenTemplate(prop.value)}}`)
          break
        case 'boolean-shorthand':
          parts.push(prop.name)
          break
        case 'literal':
          parts.push(`${prop.name}="${prop.value.value}"`)
          break
        case 'boolean-attr':
          // Element-only variant; component props use boolean-shorthand.
          parts.push(prop.name)
          break
      }
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
  }
}

export const testAdapter = new TestAdapter()
