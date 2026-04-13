/**
 * BarefootJS Mojolicious EP Template Adapter
 *
 * Generates Mojolicious EP template files (.html.ep) from BarefootJS IR.
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
  IRSlot,
  IRTemplateLiteral,
  CompilerError,
} from '@barefootjs/jsx'
import { BaseAdapter, type AdapterOutput, type AdapterGenerateOptions, isBooleanAttr } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND } from '@barefootjs/shared'

export interface MojoAdapterOptions {
  /** Base path for client JS files (default: '/static/components/') */
  clientJsBasePath?: string

  /** Path to barefoot.js runtime (default: '/static/components/barefoot.js') */
  barefootJsPath?: string
}

export class MojoAdapter extends BaseAdapter {
  name = 'mojolicious'
  extension = '.html.ep'

  private componentName: string = ''
  private options: Required<MojoAdapterOptions>
  private errors: CompilerError[] = []

  constructor(options: MojoAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
    }
  }

  generate(ir: ComponentIR, _options?: AdapterGenerateOptions): AdapterOutput {
    this.componentName = ir.metadata.componentName
    this.errors = []

    const templateBody = this.renderNode(ir.root)

    // Generate script registration
    const scriptReg = this.generateScriptRegistrations(ir)

    const template = `${scriptReg}${templateBody}\n`

    // Merge collected errors into IR errors
    if (this.errors.length > 0) {
      ir.errors.push(...this.errors)
    }

    return {
      template,
      extension: this.extension,
    }
  }

  // ===========================================================================
  // Script Registration
  // ===========================================================================

  private generateScriptRegistrations(ir: ComponentIR): string {
    const hasInteractivity = this.hasClientInteractivity(ir)
    if (!hasInteractivity) return ''

    const name = ir.metadata.componentName
    const runtimePath = this.options.barefootJsPath
    const clientJsPath = `${this.options.clientJsBasePath}${name}.client.js`

    const lines: string[] = []
    lines.push(`% $bf->register_script('${runtimePath}');`)
    lines.push(`% $bf->register_script('${clientJsPath}');`)
    lines.push('')
    return lines.join('\n')
  }

  private hasClientInteractivity(ir: ComponentIR): boolean {
    return (
      ir.metadata.signals.length > 0 ||
      ir.metadata.effects.length > 0 ||
      ir.metadata.onMounts.length > 0 ||
      (ir.metadata.clientAnalysis?.needsInit ?? false)
    )
  }

  // ===========================================================================
  // Node Rendering
  // ===========================================================================

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
        return this.renderSlot(node as IRSlot)
      default:
        return ''
    }
  }

  // ===========================================================================
  // Element Rendering
  // ===========================================================================

  renderElement(element: IRElement): string {
    const tag = element.tag
    const attrs = this.renderAttributes(element)
    const children = this.renderChildren(element.children)

    let hydrationAttrs = ''
    if (element.needsScope) {
      hydrationAttrs += ` ${this.renderScopeMarker('')}`
    }
    if (element.slotId) {
      hydrationAttrs += ` ${this.renderSlotMarker(element.slotId)}`
    }

    const voidElements = [
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr',
    ]

    if (voidElements.includes(tag.toLowerCase())) {
      return `<${tag}${attrs}${hydrationAttrs}>`
    }

    return `<${tag}${attrs}${hydrationAttrs}>${children}</${tag}>`
  }

  // ===========================================================================
  // Expression Rendering
  // ===========================================================================

  renderExpression(expr: IRExpression): string {
    if (expr.clientOnly) {
      if (expr.slotId) {
        return `<%== $bf->comment("client:${expr.slotId}") %>`
      }
      return ''
    }

    const perlExpr = this.convertExpressionToPerl(expr.expr)

    if (expr.slotId) {
      return `<%== $bf->text_start("${expr.slotId}") %><%= ${perlExpr} %><%== $bf->text_end %>`
    }

    return `<%= ${perlExpr} %>`
  }

  // ===========================================================================
  // Conditional Rendering
  // ===========================================================================

  renderConditional(cond: IRConditional): string {
    if (cond.clientOnly && cond.slotId) {
      return `<%== $bf->comment("cond-start:${cond.slotId}") %><%== $bf->comment("cond-end:${cond.slotId}") %>`
    }

    const condition = this.convertExpressionToPerl(cond.condition)
    const whenTrue = this.renderNode(cond.whenTrue)
    const whenFalse = this.renderNodeOrNull(cond.whenFalse)

    // When slotId is present, add bf-c marker.
    // Use comment markers for fragments (multiple sibling elements), attribute for single elements.
    const isFragmentBranch = cond.whenTrue.type === 'fragment' || cond.whenFalse.type === 'fragment'
    const useCommentMarkers = cond.slotId && isFragmentBranch

    let markedTrue = whenTrue
    let markedFalse = whenFalse
    if (cond.slotId && !useCommentMarkers) {
      markedTrue = this.addCondMarkerToFirstElement(whenTrue, cond.slotId)
      markedFalse = whenFalse ? this.addCondMarkerToFirstElement(whenFalse, cond.slotId) : whenFalse
    }

    let result: string
    if (useCommentMarkers) {
      // Fragment branches: use comment markers
      const inner = whenFalse
        ? `\n% if (${condition}) {\n${whenTrue}\n% } else {\n${whenFalse}\n% }\n`
        : `\n% if (${condition}) {\n${whenTrue}\n% }\n`
      result = `<%== $bf->comment("cond-start:${cond.slotId}") %>${inner}<%== $bf->comment("cond-end:${cond.slotId}") %>`
    } else if (markedFalse) {
      result = `\n% if (${condition}) {\n${markedTrue}\n% } else {\n${markedFalse}\n% }\n`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `<%== $bf->comment("cond-start:${cond.slotId}") %>\n% if (${condition}) {\n${whenTrue}\n% }\n<%== $bf->comment("cond-end:${cond.slotId}") %>`
    } else {
      result = `\n% if (${condition}) {\n${whenTrue}\n% }\n`
    }

    return result
  }

  private renderNodeOrNull(node: IRNode): string | null {
    if (node.type === 'expression' && (node.expr === 'null' || node.expr === 'undefined')) {
      return null
    }
    return this.renderNode(node)
  }

  /**
   * Add bf-c attribute to the first HTML element in a branch.
   * If no element found, wrap with comment markers.
   */
  private addCondMarkerToFirstElement(content: string, condId: string): string {
    // Match first HTML open tag
    const match = content.match(/^(<\w+)([\s>])/)
    if (match) {
      return content.replace(/^(<\w+)([\s>])/, `$1 ${BF_COND}="${condId}"$2`)
    }
    // Fall back to comment markers for non-element content
    return `<%== $bf->comment("cond-start:${condId}") %>${content}<%== $bf->comment("cond-end:${condId}") %>`
  }

  // ===========================================================================
  // Loop Rendering
  // ===========================================================================

  renderLoop(loop: IRLoop): string {
    // Client-only loops: skip SSR rendering entirely
    if (loop.clientOnly) return ''

    const array = this.convertExpressionToPerl(loop.array)
    const param = loop.param
    const indexVar = loop.index ? `$${loop.index}` : '$_i'
    const children = this.renderChildren(loop.children)

    const lines: string[] = []
    lines.push(`<%== $bf->comment("loop") %>`)
    lines.push(`% for my ${indexVar} (0..$#{${array}}) {`)
    lines.push(`% my $${param} = ${array}->[${indexVar}];`)
    lines.push(children)
    lines.push(`% }`)
    lines.push(`<%== $bf->comment("/loop") %>`)

    return lines.join('\n')
  }

  // ===========================================================================
  // Component Rendering
  // ===========================================================================

  renderComponent(comp: IRComponent): string {
    const propParts = comp.props.map(p => {
      if (p.dynamic) {
        return `${p.name} => ${this.convertExpressionToPerl(typeof p.value === 'string' ? p.value : '')}`
      }
      // Static props: quote the value
      return `${p.name} => '${p.value}'`
    })
    const propsStr = propParts.length > 0 ? ', ' + propParts.join(', ') : ''
    return `<%== $bf->render_child('${this.toTemplateName(comp.name)}'${propsStr}) %>`
  }

  private toTemplateName(componentName: string): string {
    // Convert PascalCase to snake_case for Mojo template naming
    return componentName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
  }

  // ===========================================================================
  // Fragment & Slot Rendering
  // ===========================================================================

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      return `<%== $bf->scope_comment %>${children}`
    }
    return children
  }

  private renderSlot(_slot: IRSlot): string {
    return `<%= content %>`
  }

  // ===========================================================================
  // Attribute Rendering
  // ===========================================================================

  private renderAttributes(element: IRElement): string {
    const parts: string[] = []

    for (const attr of element.attrs) {
      const attrName = attr.name === 'className' ? 'class' : attr.name

      if (attr.name === '...') {
        // Spread attributes — skip for now
        continue
      } else if (attr.value === null) {
        parts.push(attrName)
      } else if (attr.dynamic) {
        if (typeof attr.value !== 'string') {
          // IRTemplateLiteral — convert to Perl string expression
          const perlExpr = this.convertTemplateLiteralToPerl(attr.value as IRTemplateLiteral)
          parts.push(`${attrName}="<%= ${perlExpr} %>"`)
        } else if (isBooleanAttr(attrName)) {
          // Boolean attributes: render conditionally (present or absent)
          parts.push(`<%= ${this.convertExpressionToPerl(attr.value)} ? '${attrName}' : '' %>`)
        } else {
          parts.push(`${attrName}="<%= ${this.convertExpressionToPerl(attr.value)} %>"`)
        }
      } else {
        parts.push(`${attrName}="${attr.value ?? ''}"`)

      }
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
  }

  // ===========================================================================
  // Hydration Markers
  // ===========================================================================

  renderScopeMarker(_instanceIdExpr: string): string {
    return `bf-s="<%= $bf->scope_attr %>" <%== $bf->props_attr %>`
  }

  renderSlotMarker(slotId: string): string {
    return `${BF_SLOT}="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `${BF_COND}="${condId}"`
  }

  // ===========================================================================
  // Expression Conversion: JS → Perl
  // ===========================================================================

  private convertTemplateLiteralToPerl(literal: IRTemplateLiteral): string {
    const parts: string[] = []
    for (const part of literal.parts) {
      if (part.type === 'string') {
        parts.push(`'${part.value}'`)
      } else if (part.type === 'ternary') {
        const cond = this.convertExpressionToPerl(part.condition)
        parts.push(`(${cond} ? '${part.whenTrue}' : '${part.whenFalse}')`)
      }
    }
    // Join with Perl string concatenation
    return parts.length === 1 ? parts[0] : parts.join(' . ')
  }

  private convertExpressionToPerl(expr: string): string {
    // Signal getter calls: count() → $count
    let result = expr.replace(/\b([a-z_]\w*)\(\)/g, (_, name) => `$${name}`)

    // Props access: props.xxx → $xxx
    result = result.replace(/\bprops\.(\w+)/g, (_, prop) => `$${prop}`)

    // Bare identifier property access: item.field → $item->{field}
    // Must run before $-prefixed property access to catch bare identifiers
    result = result.replace(/\b([a-z_]\w*)\.(\w+)/g, (match, obj, field) => {
      // Don't convert if already $-prefixed or is a keyword
      if (match.startsWith('$')) return match
      return `$${obj}->{${field}}`
    })

    // $-prefixed property access: $item.field → $item->{field}
    result = result.replace(/\$(\w+)\.(\w+)/g, (_, obj, field) => `$${obj}->{${field}}`)

    // Chained property access: $item->{field}.sub → $item->{field}->{sub}
    result = result.replace(/\}->\{(\w+)\}\.(\w+)/g, (_, f1, f2) => `}->{${f1}}->{${f2}}`)

    // .length → scalar(@{...})
    result = result.replace(/\$(\w+)->\{length\}/g, (_, arr) => `scalar(@{$${arr}})`)

    // Nullish coalescing: a ?? b → a // b (Perl defined-or)
    result = result.replace(/\?\?/g, '//')

    // String comparison: expr === 'str' → expr eq 'str', expr !== 'str' → expr ne 'str'
    result = result.replace(/\s*===\s*(['"])/g, ' eq $1')
    result = result.replace(/\s*!==\s*(['"])/g, ' ne $1')
    // Also handle: 'str' === expr
    result = result.replace(/(['"])\s*===\s*/g, '$1 eq ')
    result = result.replace(/(['"])\s*!==\s*/g, '$1 ne ')

    // Numeric comparison (remaining === / !==)
    result = result.replace(/===/g, '==')
    result = result.replace(/!==/g, '!=')

    // Logical not: !expr → !expr (works in Perl too)
    // No conversion needed

    // Template literals: `str ${expr}` → "str $expr"
    result = result.replace(/`([^`]*)`/g, (_, content) => {
      const perlStr = content.replace(/\$\{([^}]+)\}/g, (_: string, e: string) => `${this.convertExpressionToPerl(e)}`)
      return `"${perlStr}"`
    })

    // Ensure top-level identifiers become variables
    if (/^[a-z_]\w*$/i.test(result) && !result.startsWith('$')) {
      result = `$${result}`
    }

    return result
  }
}

export const mojoAdapter = new MojoAdapter()
