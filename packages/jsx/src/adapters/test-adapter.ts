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

    // Use templateImports (client-side packages already filtered by compiler)
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

    const lines: string[] = []
    // Adapter always emits without 'export'; compiler handles export keywords
    lines.push(`function ${name}(${fullPropsDestructure}${typeAnnotation}) {`)

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

    return `{${loop.array}.map((${loop.param}${indexParam}) => ${children})}`
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

      if (attr.name === '...') {
        parts.push(`{...${attr.value}}`)
      } else if (attr.value === null) {
        parts.push(attrName)
      } else if (attr.dynamic) {
        parts.push(`${attrName}={${attr.value}}`)
      } else {
        parts.push(`${attrName}="${attr.value}"`)
      }
    }

    for (const event of element.events) {
      const handlerName = event.originalAttr ?? `on${event.name.charAt(0).toUpperCase()}${event.name.slice(1)}`
      parts.push(`${handlerName}={() => {}}`)
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
  }

  private renderComponentProps(comp: IRComponent): string {
    const parts: string[] = []

    for (const prop of comp.props) {
      if (prop.jsxChildren?.length) {
        const rendered = prop.jsxChildren.map(c => this.renderNode(c)).join('')
        parts.push(`${prop.name}={<>${rendered}</>}`)
        continue
      }
      if (prop.name === '...') {
        parts.push(`{...${prop.value}}`)
      } else if (prop.dynamic) {
        parts.push(`${prop.name}={${prop.value}}`)
      } else if (prop.value === 'true') {
        parts.push(prop.name)
      } else if (prop.value === 'false') {
        parts.push(`${prop.name}={false}`)
      } else {
        parts.push(`${prop.name}="${prop.value}"`)
      }
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
  }
}

export const testAdapter = new TestAdapter()
