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
  IRIfStatement,
  IRTemplateLiteral,
  CompilerError,
} from '@barefootjs/jsx'
import { BaseAdapter, type AdapterOutput, type AdapterGenerateOptions, isBooleanAttr, parseExpression } from '@barefootjs/jsx'
import type { ParsedExpr, ParsedStatement } from '@barefootjs/jsx'
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
  private inLoop: boolean = false

  constructor(options: MojoAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
    }
  }

  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput {
    this.componentName = ir.metadata.componentName
    this.errors = []

    const templateBody = ir.root.type === 'if-statement'
      ? this.renderIfStatement(ir.root as IRIfStatement)
      : this.renderNode(ir.root)

    // Generate script registration
    const scriptReg = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName)

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

  private generateScriptRegistrations(ir: ComponentIR, scriptBaseName?: string): string {
    const hasInteractivity = this.hasClientInteractivity(ir)
    if (!hasInteractivity) return ''

    const name = scriptBaseName ?? ir.metadata.componentName
    const runtimePath = this.options.barefootJsPath
    const clientJsPath = `${this.options.clientJsBasePath}${name}.client.js`

    const lines: string[] = []
    lines.push(`% bf->register_script('${runtimePath}');`)
    lines.push(`% bf->register_script('${clientJsPath}');`)
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
      case 'if-statement':
        return this.renderIfStatement(node as IRIfStatement)
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
        return `<%== bf->comment("client:${expr.slotId}") %>`
      }
      return ''
    }

    const perlExpr = this.convertExpressionToPerl(expr.expr)

    if (expr.slotId) {
      return `<%== bf->text_start("${expr.slotId}") %><%= ${perlExpr} %><%== bf->text_end %>`
    }

    return `<%= ${perlExpr} %>`
  }

  // ===========================================================================
  // Conditional Rendering
  // ===========================================================================

  renderConditional(cond: IRConditional): string {
    if (cond.clientOnly && cond.slotId) {
      return `<%== bf->comment("cond-start:${cond.slotId}") %><%== bf->comment("cond-end:${cond.slotId}") %>`
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
      result = `<%== bf->comment("cond-start:${cond.slotId}") %>${inner}<%== bf->comment("cond-end:${cond.slotId}") %>`
    } else if (markedFalse) {
      result = `\n% if (${condition}) {\n${markedTrue}\n% } else {\n${markedFalse}\n% }\n`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `<%== bf->comment("cond-start:${cond.slotId}") %>\n% if (${condition}) {\n${whenTrue}\n% }\n<%== bf->comment("cond-end:${cond.slotId}") %>`
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
    return `<%== bf->comment("cond-start:${condId}") %>${content}<%== bf->comment("cond-end:${condId}") %>`
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
    const prevInLoop = this.inLoop
    this.inLoop = true
    const children = this.renderChildren(loop.children)
    this.inLoop = prevInLoop

    const lines: string[] = []
    lines.push(`<%== bf->comment("loop") %>`)
    lines.push(`% for my ${indexVar} (0..$#{${array}}) {`)
    lines.push(`% my $${param} = ${array}->[${indexVar}];`)

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.blockBody) {
        filterCond = this.renderBlockBodyCondition(
          loop.filterPredicate.blockBody,
          loop.filterPredicate.param
        )
      } else if (loop.filterPredicate.predicate) {
        filterCond = this.renderPerlFilterExpr(
          loop.filterPredicate.predicate,
          loop.filterPredicate.param
        )
      } else {
        filterCond = '1'
      }
      // Map filter param to loop param (e.g., $t → $todo)
      if (loop.filterPredicate.param !== param) {
        filterCond = filterCond.replace(
          new RegExp(`\\$${loop.filterPredicate.param}\\b`, 'g'),
          `$${param}`
        )
      }
      lines.push(`% if (${filterCond}) {`)
      lines.push(children)
      lines.push(`% }`)
    } else {
      lines.push(children)
    }

    lines.push(`% }`)
    lines.push(`<%== bf->comment("/loop") %>`)

    return lines.join('\n')
  }

  // ===========================================================================
  // Component Rendering
  // ===========================================================================

  renderComponent(comp: IRComponent): string {
    const propParts: string[] = []
    for (const p of comp.props) {
      // Skip callback props (onXxx) — event handlers are client-only for SSR
      if (p.name.match(/^on[A-Z]/) && p.dynamic) continue
      if (p.dynamic) {
        propParts.push(`${p.name} => ${this.convertExpressionToPerl(typeof p.value === 'string' ? p.value : '')}`)
      } else {
        propParts.push(`${p.name} => '${p.value}'`)
      }
    }
    // Pass slot ID so the child renderer can set correct scope ID for hydration
    // Skip for loop children — they use ComponentName_random pattern instead
    if (comp.slotId && !this.inLoop) {
      propParts.push(`_bf_slot => '${comp.slotId}'`)
    }
    const propsStr = propParts.length > 0 ? ', ' + propParts.join(', ') : ''
    return `<%== bf->render_child('${this.toTemplateName(comp.name)}'${propsStr}) %>`
  }

  private toTemplateName(componentName: string): string {
    // Convert PascalCase to snake_case for Mojo template naming
    return componentName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
  }

  // ===========================================================================
  // If-Statement (Conditional Return) Rendering
  // ===========================================================================

  private renderIfStatement(ifStmt: IRIfStatement): string {
    const condition = this.convertExpressionToPerl(ifStmt.condition)
    const consequent = ifStmt.consequent.type === 'if-statement'
      ? this.renderIfStatement(ifStmt.consequent as IRIfStatement)
      : this.renderNode(ifStmt.consequent)
    let result = `% if (${condition}) {\n${consequent}\n`

    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        const altResult = this.renderIfStatement(ifStmt.alternate as IRIfStatement)
        // Replace leading "% if" with "% } elsif"
        result += altResult.replace(/^% if/, '% } elsif')
      } else {
        const alternate = this.renderNode(ifStmt.alternate)
        result += `% } else {\n${alternate}\n`
      }
    }

    result += `% }`
    return result
  }

  // ===========================================================================
  // Fragment & Slot Rendering
  // ===========================================================================

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      return `<%== bf->scope_comment %>${children}`
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
    return `bf-s="<%= bf->scope_attr %>" <%== bf->props_attr %>`
  }

  renderSlotMarker(slotId: string): string {
    return `${BF_SLOT}="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `${BF_COND}="${condId}"`
  }

  // ===========================================================================
  // Filter Predicate Rendering (ParsedExpr → Perl)
  // ===========================================================================

  /**
   * Convert a ParsedExpr AST to Perl expression string.
   * Used for filter predicates in loops and standalone higher-order expressions.
   */
  private renderPerlFilterExpr(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string> = new Map()
  ): string {
    switch (expr.kind) {
      case 'identifier': {
        if (expr.name === param) return `$${param}`
        const signal = localVarMap.get(expr.name)
        if (signal) return `$${signal}`
        return `$${expr.name}`
      }

      case 'literal':
        if (expr.literalType === 'string') return `'${expr.value}'`
        if (expr.literalType === 'boolean') return expr.value ? '1' : '0'
        if (expr.literalType === 'null') return 'undef'
        return String(expr.value)

      case 'member': {
        const obj = this.renderPerlFilterExpr(expr.object, param, localVarMap)
        return `${obj}->{${expr.property}}`
      }

      case 'call': {
        // Signal getter calls: filter() → $filter
        if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
          return `$${expr.callee.name}`
        }
        return this.renderPerlFilterExpr(expr.callee, param, localVarMap)
      }

      case 'unary': {
        const arg = this.renderPerlFilterExpr(expr.argument, param, localVarMap)
        if (expr.op === '!') {
          // Wrap in parens for binary/logical to avoid Perl precedence issues
          const needsParens = expr.argument.kind === 'binary' || expr.argument.kind === 'logical'
          return needsParens ? `!(${arg})` : `!${arg}`
        }
        if (expr.op === '-') return `-${arg}`
        return arg
      }

      case 'binary': {
        const left = this.renderPerlFilterExpr(expr.left, param, localVarMap)
        const right = this.renderPerlFilterExpr(expr.right, param, localVarMap)
        // String comparison
        if ((expr.op === '===' || expr.op === '==') && (expr.right.kind === 'literal' && expr.right.literalType === 'string')) {
          return `${left} eq ${right}`
        }
        if ((expr.op === '!==' || expr.op === '!=') && (expr.right.kind === 'literal' && expr.right.literalType === 'string')) {
          return `${left} ne ${right}`
        }
        const opMap: Record<string, string> = { '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=', '+': '+', '-': '-', '*': '*', '/': '/' }
        const perlOp = opMap[expr.op] ?? expr.op
        return `${left} ${perlOp} ${right}`
      }

      case 'logical': {
        const left = this.renderPerlFilterExpr(expr.left, param, localVarMap)
        const right = this.renderPerlFilterExpr(expr.right, param, localVarMap)
        if (expr.op === '&&') return `(${left} && ${right})`
        if (expr.op === '||') return `(${left} || ${right})`
        return `(${left} // ${right})`  // ?? → //
      }

      case 'higher-order': {
        // filter/every/some on arrays → Perl grep
        const arrayExpr = this.renderPerlFilterExpr(expr.object, param, localVarMap)
        const predBody = this.renderPerlFilterExpr(expr.predicate, expr.param, localVarMap)
        // In grep block, use $_ for the loop variable
        const grepBody = predBody.replace(new RegExp(`\\$${expr.param}\\b`, 'g'), '$_')
        if (expr.method === 'filter') {
          return `[grep { ${grepBody} } @{${arrayExpr}}]`
        }
        if (expr.method === 'every') {
          return `!(grep { !(${grepBody}) } @{${arrayExpr}})`
        }
        if (expr.method === 'some') {
          return `!!(grep { ${grepBody} } @{${arrayExpr}})`
        }
        return `${arrayExpr}`
      }

      default:
        return '1'
    }
  }

  /**
   * Render a complex block body filter into a Perl condition.
   * Handles patterns like: filter(t => { const f = filter(); if (...) return ...; })
   */
  private renderBlockBodyCondition(
    statements: ParsedStatement[],
    param: string
  ): string {
    const localVarMap = new Map<string, string>()
    const paths = this.collectReturnPaths(statements, [], localVarMap, param)

    if (paths.length === 0) return '1'
    if (paths.length === 1) return this.buildSinglePathCondition(paths[0], param, localVarMap)

    // Multiple paths: build OR condition
    const parts: string[] = []
    for (const path of paths) {
      if (path.result.kind === 'literal' && path.result.literalType === 'boolean' && path.result.value === false) continue
      const cond = this.buildSinglePathCondition(path, param, localVarMap)
      if (cond !== '0') parts.push(cond)
    }

    if (parts.length === 0) return '0'
    if (parts.length === 1) return parts[0]
    return `(${parts.join(' || ')})`
  }

  private collectReturnPaths(
    statements: ParsedStatement[],
    currentConditions: ParsedExpr[],
    localVarMap: Map<string, string>,
    param: string
  ): Array<{ conditions: ParsedExpr[]; result: ParsedExpr }> {
    const paths: Array<{ conditions: ParsedExpr[]; result: ParsedExpr }> = []

    for (const stmt of statements) {
      if (stmt.kind === 'var-decl') {
        if (stmt.init.kind === 'call' && stmt.init.callee.kind === 'identifier') {
          localVarMap.set(stmt.name, stmt.init.callee.name)
        }
      } else if (stmt.kind === 'return') {
        paths.push({ conditions: [...currentConditions], result: stmt.value })
        break
      } else if (stmt.kind === 'if') {
        const thenPaths = this.collectReturnPaths(stmt.consequent, [...currentConditions, stmt.condition], localVarMap, param)
        paths.push(...thenPaths)

        if (stmt.alternate) {
          const negated: ParsedExpr = { kind: 'unary', op: '!', argument: stmt.condition }
          const elsePaths = this.collectReturnPaths(stmt.alternate, [...currentConditions, negated], localVarMap, param)
          paths.push(...elsePaths)
        } else {
          currentConditions.push({ kind: 'unary', op: '!', argument: stmt.condition })
        }
      }
    }

    return paths
  }

  private buildSinglePathCondition(
    path: { conditions: ParsedExpr[]; result: ParsedExpr },
    param: string,
    localVarMap: Map<string, string>
  ): string {
    if (path.result.kind === 'literal' && path.result.literalType === 'boolean') {
      if (path.result.value === true) {
        if (path.conditions.length === 0) return '1'
        return this.renderConditionsAnd(path.conditions, param, localVarMap)
      }
      return '0'
    }

    if (path.conditions.length === 0) {
      return this.renderPerlFilterExpr(path.result, param, localVarMap)
    }

    const condPart = this.renderConditionsAnd(path.conditions, param, localVarMap)
    const resultPart = this.renderPerlFilterExpr(path.result, param, localVarMap)
    return `(${condPart} && ${resultPart})`
  }

  private renderConditionsAnd(
    conditions: ParsedExpr[],
    param: string,
    localVarMap: Map<string, string>
  ): string {
    if (conditions.length === 0) return '1'
    if (conditions.length === 1) return this.renderPerlFilterExpr(conditions[0], param, localVarMap)
    const parts = conditions.map(c => this.renderPerlFilterExpr(c, param, localVarMap))
    return `(${parts.join(' && ')})`
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
    // Handle higher-order array methods via ParsedExpr AST
    if (/\.\s*(?:filter|every|some)\s*\(/.test(expr)) {
      return this.convertHigherOrderExpr(expr)
    }

    // Signal getter calls: count() → $count
    let result = expr.replace(/\b([a-z_]\w*)\(\)/g, (_, name) => `$${name}`)

    // Props access: props.xxx → $xxx
    result = result.replace(/\bprops\.(\w+)/g, (_, prop) => `$${prop}`)

    // Bare identifier property access: item.field → $item->{field}
    // Must run before $-prefixed property access to catch bare identifiers
    // Use negative lookbehind to skip $-prefixed variables (avoid $$var double-prefix)
    result = result.replace(/(?<!\$)\b([a-z_]\w*)\.(\w+)/g, (match, obj, field) => {
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
  /**
   * Convert expressions containing higher-order array methods to Perl.
   * Parses the full expression as AST and renders recursively.
   *
   * Handles patterns like:
   * - todos().filter(t => !t.done).length → scalar(grep { !$_->{done} } @{$todos})
   * - todos().every(t => t.done) → !(grep { !$_->{done} } @{$todos})
   * - todos().filter(t => t.done).length > 0 → scalar(grep { $_->{done} } @{$todos}) > 0
   */
  private convertHigherOrderExpr(expr: string): string {
    const parsed = parseExpression(expr)
    return this.renderParsedExprToPerl(parsed)
  }

  /**
   * Render a full ParsedExpr tree to Perl (for standalone expressions, not filter predicates).
   * Unlike renderPerlFilterExpr which uses a filter param context, this handles
   * top-level expressions where identifiers are signals/stash vars.
   */
  private renderParsedExprToPerl(expr: ParsedExpr): string {
    switch (expr.kind) {
      case 'identifier':
        return `$${expr.name}`

      case 'literal':
        if (expr.literalType === 'string') return `'${expr.value}'`
        if (expr.literalType === 'boolean') return expr.value ? '1' : '0'
        if (expr.literalType === 'null') return 'undef'
        return String(expr.value)

      case 'member': {
        const obj = this.renderParsedExprToPerl(expr.object)
        if (expr.property === 'length') {
          // Array length: expr.length → scalar(@{expr})
          return `scalar(@{${obj}})`
        }
        return `${obj}->{${expr.property}}`
      }

      case 'call': {
        // Signal getter: count() → $count
        if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
          return `$${expr.callee.name}`
        }
        return this.renderParsedExprToPerl(expr.callee)
      }

      case 'unary': {
        const arg = this.renderParsedExprToPerl(expr.argument)
        if (expr.op === '!') return `!${arg}`
        if (expr.op === '-') return `-${arg}`
        return arg
      }

      case 'binary': {
        const left = this.renderParsedExprToPerl(expr.left)
        const right = this.renderParsedExprToPerl(expr.right)
        if ((expr.op === '===' || expr.op === '==') && expr.right.kind === 'literal' && expr.right.literalType === 'string') {
          return `${left} eq ${right}`
        }
        if ((expr.op === '!==' || expr.op === '!=') && expr.right.kind === 'literal' && expr.right.literalType === 'string') {
          return `${left} ne ${right}`
        }
        const opMap: Record<string, string> = { '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=', '+': '+', '-': '-', '*': '*' }
        return `${left} ${opMap[expr.op] ?? expr.op} ${right}`
      }

      case 'logical': {
        const left = this.renderParsedExprToPerl(expr.left)
        const right = this.renderParsedExprToPerl(expr.right)
        if (expr.op === '&&') return `(${left} && ${right})`
        if (expr.op === '||') return `(${left} || ${right})`
        return `(${left} // ${right})`
      }

      case 'higher-order': {
        const arrayExpr = this.renderParsedExprToPerl(expr.object)
        const predBody = this.renderPerlFilterExpr(expr.predicate, expr.param)
        const grepBody = predBody.replace(new RegExp(`\\$${expr.param}\\b`, 'g'), '$_')
        if (expr.method === 'filter') {
          return `[grep { ${grepBody} } @{${arrayExpr}}]`
        }
        if (expr.method === 'every') {
          return `!(grep { !(${grepBody}) } @{${arrayExpr}})`
        }
        if (expr.method === 'some') {
          return `!!(grep { ${grepBody} } @{${arrayExpr}})`
        }
        return arrayExpr
      }

      case 'conditional': {
        const test = this.renderParsedExprToPerl(expr.test)
        const consequent = this.renderParsedExprToPerl(expr.consequent)
        const alternate = this.renderParsedExprToPerl(expr.alternate)
        return `(${test} ? ${consequent} : ${alternate})`
      }

      default:
        // Fallback: use regex-based conversion
        return this.convertExpressionToPerl(('raw' in expr) ? (expr as { raw: string }).raw : '')
    }
  }
}

export const mojoAdapter = new MojoAdapter()
