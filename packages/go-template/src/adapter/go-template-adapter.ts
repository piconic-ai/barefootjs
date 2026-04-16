/**
 * BarefootJS Go html/template Adapter
 *
 * Generates Go html/template files from BarefootJS IR.
 */

import type {
  ComponentIR,
  IRNode,
  IRElement,
  IRText,
  IRExpression,
  IRConditional,
  IRLoop,
  IRLoopChildComponent,
  IRComponent,
  IRFragment,
  IRSlot,
  IRTemplateLiteral,
  IRProp,
  TypeInfo,
  CompilerError,
  SourceLocation,
  ParsedExpr,
  ParsedStatement,
  IRIfStatement,
  IRProvider,
  IRAsync,
} from '@barefootjs/jsx'
import { BaseAdapter, type AdapterOutput, type AdapterGenerateOptions, isBooleanAttr, parseExpression, isSupported } from '@barefootjs/jsx'

export interface GoTemplateAdapterOptions {
  /** Go package name for generated types (default: 'components') */
  packageName?: string
}

/**
 * Convert a slot ID (e.g., 's6') to a Go struct field suffix (e.g., 'Slot6').
 * Keeps field names human-readable regardless of the internal slot ID format.
 */
function slotIdToFieldSuffix(slotId: string): string {
  // Strip parent-owned prefix (^) for Go struct field names
  const cleanId = slotId.startsWith('^') ? slotId.slice(1) : slotId
  const match = cleanId.match(/^s(\d+)$/)
  if (match) {
    return `Slot${match[1]}`
  }
  // Fallback for legacy format or non-standard IDs
  return cleanId.replace('slot_', 'Slot')
}

export class GoTemplateAdapter extends BaseAdapter {
  name = 'go-template'
  extension = '.tmpl'

  private componentName: string = ''
  private options: Required<GoTemplateAdapterOptions>
  private inLoop: boolean = false
  private loopParamStack: string[] = []
  private errors: CompilerError[] = []
  private propsObjectName: string | null = null
  /** Local type names resolved from typeDefinitions (populated during generateTypes) */
  private localTypeNames: Set<string> = new Set()

  constructor(options: GoTemplateAdapterOptions = {}) {
    super()
    this.options = {
      packageName: options.packageName ?? 'components',
    }
  }

  /**
   * Generate template output for a component.
   * @param ir - The component IR
   * @param options - Generation options
   */
  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput {
    this.componentName = ir.metadata.componentName
    this.errors = []
    this.propsObjectName = ir.metadata.propsObjectName

    const hasInteractivity = this.hasClientInteractivity(ir)
    const isRootComponent = ir.root.type === 'component'
    const isIfStatement = ir.root.type === 'if-statement'

    const templateBody = isIfStatement
      ? this.renderIfStatement(ir.root as IRIfStatement, { isRootOfClientComponent: hasInteractivity })
      : this.renderNode(ir.root, { isRootOfClientComponent: hasInteractivity && isRootComponent })

    // Generate script registration code at template start (unless skipped)
    const scriptRegistrations = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName)

    const template = `{{define "${this.componentName}"}}\n${scriptRegistrations}${templateBody}\n{{end}}\n`
    const types = this.generateTypes(ir)

    // Merge collected errors into IR errors
    if (this.errors.length > 0) {
      ir.errors.push(...this.errors)
    }

    return {
      template,
      types: types || undefined,
      extension: this.extension,
    }
  }

  /**
   * Check if a component has client interactivity (needs client JS).
   * A component has client interactivity if it has:
   * - Signals (reactive state)
   * - Effects (side effects)
   * - Events on elements
   */
  private hasClientInteractivity(ir: ComponentIR): boolean {
    // Check for signals
    if (ir.metadata.signals.length > 0) return true

    // Check for effects
    if (ir.metadata.effects.length > 0) return true

    // Check for onMounts
    if (ir.metadata.onMounts.length > 0) return true

    // Check for events in the IR tree
    if (this.hasEventsInTree(ir.root)) return true

    // Check for child components (they need parent's hydration)
    if (this.findChildComponentNames(ir.root).size > 0) return true

    return false
  }

  /**
   * Recursively check if any element in the tree has events.
   */
  private hasEventsInTree(node: IRNode): boolean {
    if (node.type === 'element') {
      const element = node as IRElement
      if (element.events.length > 0) return true
      for (const child of element.children) {
        if (this.hasEventsInTree(child)) return true
      }
    } else if (node.type === 'fragment') {
      const fragment = node as IRFragment
      for (const child of fragment.children) {
        if (this.hasEventsInTree(child)) return true
      }
    } else if (node.type === 'conditional') {
      const cond = node as IRConditional
      if (this.hasEventsInTree(cond.whenTrue)) return true
      if (cond.whenFalse && this.hasEventsInTree(cond.whenFalse)) return true
    } else if (node.type === 'loop') {
      const loop = node as IRLoop
      for (const child of loop.children) {
        if (this.hasEventsInTree(child)) return true
      }
    } else if (node.type === 'if-statement') {
      const ifStmt = node as IRIfStatement
      if (this.hasEventsInTree(ifStmt.consequent)) return true
      if (ifStmt.alternate && this.hasEventsInTree(ifStmt.alternate)) return true
    }
    return false
  }

  /**
   * Find all child component names used in the IR tree.
   */
  private findChildComponentNames(node: IRNode): Set<string> {
    const names = new Set<string>()
    this.collectChildComponentNames(node, names)
    return names
  }

  private collectChildComponentNames(node: IRNode, names: Set<string>): void {
    if (node.type === 'component') {
      const comp = node as IRComponent
      names.add(comp.name)
    } else if (node.type === 'element') {
      const element = node as IRElement
      for (const child of element.children) {
        this.collectChildComponentNames(child, names)
      }
    } else if (node.type === 'fragment') {
      const fragment = node as IRFragment
      for (const child of fragment.children) {
        this.collectChildComponentNames(child, names)
      }
    } else if (node.type === 'conditional') {
      const cond = node as IRConditional
      this.collectChildComponentNames(cond.whenTrue, names)
      if (cond.whenFalse) {
        this.collectChildComponentNames(cond.whenFalse, names)
      }
    } else if (node.type === 'loop') {
      const loop = node as IRLoop
      for (const child of loop.children) {
        this.collectChildComponentNames(child, names)
      }
    } else if (node.type === 'if-statement') {
      const ifStmt = node as IRIfStatement
      this.collectChildComponentNames(ifStmt.consequent, names)
      if (ifStmt.alternate) {
        this.collectChildComponentNames(ifStmt.alternate, names)
      }
    }
  }

  /**
   * Generate script registration code for the template.
   * Scripts are registered at the beginning of the template.
   * Uses .Scripts which is available on all Props structs.
   * The same ScriptCollector should be shared across parent and child props.
   * Wrapped in {{if .Scripts}} to safely handle nil Scripts.
   */
  private generateScriptRegistrations(ir: ComponentIR, scriptBaseName?: string): string {
    // Check if this component has client interactivity
    const hasInteractivity = this.hasClientInteractivity(ir)

    if (!hasInteractivity) {
      return ''
    }

    const registrations: string[] = []

    // Register barefoot.js runtime first
    registrations.push(`{{.Scripts.Register "/static/client/barefoot.js"}}`)

    // Register this component's script
    // Use scriptBaseName if provided (for non-default exports sharing parent's .client.js)
    const scriptName = scriptBaseName || ir.metadata.componentName
    registrations.push(`{{.Scripts.Register "/static/client/${scriptName}.client.js"}}`)

    // Wrap in nil check to safely handle cases where Scripts is not set
    return `{{if .Scripts}}${registrations.join('')}{{end}}\n`
  }

  generateTypes(ir: ComponentIR): string | null {
    const lines: string[] = []
    lines.push(`package ${this.options.packageName}`)
    lines.push('')
    lines.push('import (')
    lines.push('\t"math/rand"')
    lines.push('')
    lines.push('\tbf "github.com/barefootjs/runtime/bf"')
    lines.push(')')
    lines.push('')

    const componentName = ir.metadata.componentName

    // Build set of locally-defined type names so typeInfoToGo can resolve them
    this.localTypeNames = new Set<string>()
    for (const td of ir.metadata.typeDefinitions) {
      // Skip the Props type itself (it's the component's own props, not a reusable type)
      if (td.name === 'Props' || td.name === `${componentName}Props`) continue
      this.localTypeNames.add(td.name)
    }

    // Generate Go structs for local type definitions (e.g., Todo, Filter → string alias)
    for (const td of ir.metadata.typeDefinitions) {
      if (td.name === 'Props' || td.name === `${componentName}Props`) continue
      const goStruct = this.typeDefinitionToGo(td)
      if (goStruct) {
        lines.push(goStruct)
        lines.push('')
      }
    }

    // Find nested components (loops with childComponent)
    const nestedComponents = this.findNestedComponents(ir.root)

    // Build prop type overrides from signal types
    const propTypeOverrides = this.buildPropTypeOverrides(ir)

    // Generate Input struct for main component
    this.generateInputStruct(lines, ir, componentName, nestedComponents, propTypeOverrides)

    // Generate Props struct for main component
    this.generatePropsStruct(lines, ir, componentName, nestedComponents, propTypeOverrides)

    // Generate NewXxxProps function
    this.generateNewPropsFunction(lines, ir, componentName, nestedComponents)

    return lines.join('\n')
  }

  /**
   * Convert a TypeScript type definition to a Go type.
   * Handles object types → Go structs, and union string literals → string alias.
   */
  private typeDefinitionToGo(td: { kind: string; name: string; definition: string }): string | null {
    const def = td.definition

    // String literal union: type Filter = 'all' | 'active' | 'completed'
    if (def.match(/^type \w+ = ('[^']*'(\s*\|\s*'[^']*')*)/)) {
      // Map to Go string (union of string literals → just string in Go)
      return `// ${td.name} is a string type.\ntype ${td.name} = string`
    }

    // Object/interface type: type Todo = { id: number; text: string; ... }
    const bodyMatch = def.match(/(?:type \w+ = |interface \w+ )\{([\s\S]*)\}/)
    if (!bodyMatch) return null

    const body = bodyMatch[1]
    const goFields: string[] = []

    // Parse each field: "fieldName: type" or "fieldName?: type"
    // Handle both semicolon-separated and newline-separated
    const fieldEntries = body.split(/[;\n]/).map(s => s.trim()).filter(Boolean)
    for (const entry of fieldEntries) {
      const fieldMatch = entry.match(/^(\w+)\??\s*:\s*(.+)$/)
      if (!fieldMatch) continue
      const [, fieldName, tsType] = fieldMatch
      const goFieldName = this.capitalizeFieldName(fieldName)
      const goType = this.tsTypeStringToGo(tsType.trim())
      const jsonTag = this.toJsonTag(fieldName)
      goFields.push(`\t${goFieldName} ${goType} \`json:"${jsonTag}"\``)
    }

    if (goFields.length === 0) return null

    return `// ${td.name} represents a ${td.name.toLowerCase()}.\ntype ${td.name} struct {\n${goFields.join('\n')}\n}`
  }

  /**
   * Convert a raw TypeScript type string to a Go type string.
   * Handles primitives (number, string, boolean) and basic arrays.
   */
  private tsTypeStringToGo(tsType: string): string {
    const t = tsType.trim()
    if (t === 'number') return 'int'
    if (t === 'string') return 'string'
    if (t === 'boolean' || t === 'bool') return 'bool'
    if (t.endsWith('[]')) {
      const elem = t.slice(0, -2)
      return `[]${this.tsTypeStringToGo(elem)}`
    }
    const arrayMatch = t.match(/^Array<(.+)>$/)
    if (arrayMatch) return `[]${this.tsTypeStringToGo(arrayMatch[1])}`
    // Check if it's a known local type
    if (this.localTypeNames.has(t)) return t
    return 'interface{}'
  }

  /**
   * Build a map from prop name to a better Go type inferred from signals.
   * When a signal is initialized from a prop (e.g., createSignal(props.initial ?? 0)),
   * the signal's type annotation may be more specific than the prop's TypeInfo.
   */
  private buildPropTypeOverrides(ir: ComponentIR): Map<string, string> {
    const overrides = new Map<string, string>()
    for (const signal of ir.metadata.signals) {
      // Check simple identifier reference
      const propNames = [signal.initialValue]
      const extracted = this.extractPropNameFromInitialValue(signal.initialValue)
      if (extracted) propNames.push(extracted)

      for (const propName of propNames) {
        const param = ir.metadata.propsParams.find(p => p.name === propName)
        if (!param) continue
        const propGoType = this.typeInfoToGo(param.type, param.defaultValue)
        // Override when prop type is generic (interface{} or contains interface{})
        if (propGoType.includes('interface{}')) {
          const signalGoType = this.typeInfoToGo(signal.type, signal.initialValue)
          if (!signalGoType.includes('interface{}')) {
            overrides.set(propName, signalGoType)
          }
        }
      }
    }
    return overrides
  }

  /**
   * Generate Input struct for a component
   */
  private generateInputStruct(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    nestedComponents: IRLoopChildComponent[],
    propTypeOverrides: Map<string, string>
  ): void {
    const inputTypeName = `${componentName}Input`
    lines.push(`// ${inputTypeName} is the user-facing input type.`)
    lines.push(`type ${inputTypeName} struct {`)
    lines.push('\tScopeID string // Optional: if empty, random ID is generated')

    // Collect nested component array field names to skip from propsParams
    const nestedArrayFields = new Set(nestedComponents.map(n => `${n.name}s`))

    // Add props params (excluding nested array fields)
    for (const param of ir.metadata.propsParams) {
      const fieldName = this.capitalizeFieldName(param.name)
      if (nestedArrayFields.has(fieldName)) continue
      const goType = propTypeOverrides.get(param.name) ?? this.typeInfoToGo(param.type, param.defaultValue)
      lines.push(`\t${fieldName} ${goType}`)
    }

    // Add nested component input arrays
    for (const nested of nestedComponents) {
      lines.push(`\t${nested.name}s []${nested.name}Input`)
    }

    lines.push('}')
    lines.push('')
  }

  /**
   * Generate Props struct for a component
   */
  private generatePropsStruct(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    nestedComponents: IRLoopChildComponent[],
    propTypeOverrides: Map<string, string>
  ): void {
    const propsTypeName = `${componentName}Props`
    lines.push(`// ${propsTypeName} is the props type for the ${componentName} component.`)
    lines.push(`type ${propsTypeName} struct {`)
    lines.push('\tScopeID string `json:"scopeID"`')
    lines.push('\tBfIsRoot bool `json:"-"`')
    lines.push('\tBfIsChild bool `json:"-"`')

    // Add Scripts field for dynamic script collection
    lines.push('\tScripts *bf.ScriptCollector `json:"-"`')

    // Collect nested component array field names to skip from propsParams
    const nestedArrayFields = new Set(nestedComponents.map(n => `${n.name}s`))

    // Track emitted prop field names to avoid duplicate fields when signal name matches prop name
    const propFieldNames = new Set<string>()

    for (const param of ir.metadata.propsParams) {
      const fieldName = this.capitalizeFieldName(param.name)
      // Skip if this field will be replaced by a typed array for nested components
      if (nestedArrayFields.has(fieldName)) continue
      const goType = propTypeOverrides.get(param.name) ?? this.typeInfoToGo(param.type, param.defaultValue)
      const jsonTag = this.toJsonTag(param.name)
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
      propFieldNames.add(fieldName)
    }

    // Find signal types by looking at their initial values
    const propsParamMap = new Map(ir.metadata.propsParams.map(p => [p.name, p]))

    for (const signal of ir.metadata.signals) {
      const fieldName = this.capitalizeFieldName(signal.getter)
      // Skip if a prop field with the same name was already emitted
      if (propFieldNames.has(fieldName)) continue
      const jsonTag = this.toJsonTag(signal.getter)
      // Infer type from initial value or referenced prop's type
      let goType: string
      let referencedProp = propsParamMap.get(signal.initialValue)
      if (!referencedProp) {
        const propName = this.extractPropNameFromInitialValue(signal.initialValue)
        if (propName) referencedProp = propsParamMap.get(propName)
      }
      if (referencedProp) {
        const propGoType = this.typeInfoToGo(referencedProp.type, referencedProp.defaultValue)
        // Prefer signal's own type when prop type is too generic
        if (propGoType.includes('interface{}')) {
          goType = this.typeInfoToGo(signal.type, signal.initialValue)
        } else {
          goType = propGoType
        }
      } else {
        goType = this.typeInfoToGo(signal.type, signal.initialValue)
      }
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
    }

    // Add memos to Props (they are computed values needed for SSR)
    for (const memo of ir.metadata.memos) {
      const fieldName = this.capitalizeFieldName(memo.name)
      const jsonTag = this.toJsonTag(memo.name)
      // Memos that depend on number signals are usually numbers
      const goType = this.inferMemoType(memo, ir.metadata.signals, propsParamMap)
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
    }

    // Add array fields for nested components (for template rendering)
    for (const nested of nestedComponents) {
      const jsonTag = this.toJsonTag(`${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`)
      lines.push(`\t${nested.name}s []${nested.name}Props \`json:"${jsonTag}"\``)
    }

    // Add fields for static child component instances
    const staticChildren = this.collectStaticChildInstances(ir.root)
    for (const child of staticChildren) {
      lines.push(`\t${child.fieldName} ${child.name}Props \`json:"-"\``)
    }

    lines.push('}')
    lines.push('')
  }

  /**
   * Generate NewXxxProps function
   */
  private generateNewPropsFunction(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    nestedComponents: IRLoopChildComponent[]
  ): void {
    const inputTypeName = `${componentName}Input`
    const propsTypeName = `${componentName}Props`

    lines.push(`// New${componentName}Props creates ${propsTypeName} from ${inputTypeName}.`)
    lines.push(`func New${componentName}Props(in ${inputTypeName}) ${propsTypeName} {`)
    lines.push('\tscopeID := in.ScopeID')
    lines.push('\tif scopeID == "" {')
    lines.push(`\t\tscopeID = "${componentName}_" + randomID(6)`)
    lines.push('\t}')
    lines.push('')

    // Handle nested components
    if (nestedComponents.length > 0) {
      for (const nested of nestedComponents) {
        const varName = `${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`
        lines.push(`\t${varName} := make([]${nested.name}Props, len(in.${nested.name}s))`)
        lines.push(`\tfor i, item := range in.${nested.name}s {`)
        lines.push(`\t\t${varName}[i] = New${nested.name}Props(item)`)
        lines.push('\t}')
        lines.push('')
      }
    }

    lines.push(`\treturn ${propsTypeName}{`)
    lines.push('\t\tScopeID: scopeID,')

    // Collect nested component array field names
    const nestedArrayFields = new Set(nestedComponents.map(n => `${n.name}s`))

    // Add props params, tracking field names to skip duplicate signal assignments
    const propFieldNames = new Set<string>()
    for (const param of ir.metadata.propsParams) {
      const fieldName = this.capitalizeFieldName(param.name)
      if (nestedArrayFields.has(fieldName)) continue
      lines.push(`\t\t${fieldName}: in.${fieldName},`)
      propFieldNames.add(fieldName)
    }

    // Add signal initial values (skip if prop field with same name already emitted)
    for (const signal of ir.metadata.signals) {
      const fieldName = this.capitalizeFieldName(signal.getter)
      if (propFieldNames.has(fieldName)) continue
      const initialValue = this.convertInitialValue(signal.initialValue, signal.type, ir.metadata.propsParams)
      lines.push(`\t\t${fieldName}: ${initialValue},`)
    }

    // Add nested component arrays
    for (const nested of nestedComponents) {
      const varName = `${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`
      lines.push(`\t\t${nested.name}s: ${varName},`)
    }

    // Add memo initial values (computed from signal initial values)
    for (const memo of ir.metadata.memos) {
      const fieldName = this.capitalizeFieldName(memo.name)
      const memoValue = this.computeMemoInitialValue(memo, ir.metadata.signals, ir.metadata.propsParams)
      lines.push(`\t\t${fieldName}: ${memoValue},`)
    }

    // Add static child component instances
    const staticChildren = this.collectStaticChildInstances(ir.root)
    for (const child of staticChildren) {
      lines.push(`\t\t${child.fieldName}: New${child.name}Props(${child.name}Input{`)
      lines.push(`\t\t\tScopeID: scopeID + "_${child.slotId}",`)
      // Add prop values
      for (const prop of child.props) {
        if (prop.isLiteral) {
          lines.push(`\t\t\t${this.capitalizeFieldName(prop.name)}: ${this.goLiteral(prop.value)},`)
        } else {
          // Dynamic prop - resolve to parent's initial signal/memo value
          const resolvedValue = this.resolveDynamicPropValue(
            prop.value,
            ir.metadata.signals,
            ir.metadata.memos,
            ir.metadata.propsParams
          )
          if (resolvedValue !== null) {
            lines.push(`\t\t\t${this.capitalizeFieldName(prop.name)}: ${resolvedValue},`)
          }
        }
      }
      lines.push(`\t\t}),`)
    }

    lines.push('\t}')
    lines.push('}')
  }

  /**
   * Convert field name to JSON tag (camelCase)
   */
  private toJsonTag(name: string): string {
    return name.charAt(0).toLowerCase() + name.slice(1)
  }

  /**
   * Find all nested components (loops with childComponent)
   */
  private findNestedComponents(node: IRNode): IRLoopChildComponent[] {
    const result: IRLoopChildComponent[] = []
    this.collectNestedComponents(node, result)
    return result
  }

  private collectNestedComponents(node: IRNode, result: IRLoopChildComponent[]): void {
    if (node.type === 'loop') {
      const loop = node as IRLoop
      if (loop.isStaticArray && loop.childComponent) {
        // Check for duplicates
        if (!result.some(c => c.name === loop.childComponent!.name)) {
          result.push(loop.childComponent)
        }
      }
      for (const child of loop.children) {
        this.collectNestedComponents(child, result)
      }
    } else if (node.type === 'element') {
      const element = node as IRElement
      for (const child of element.children) {
        this.collectNestedComponents(child, result)
      }
    } else if (node.type === 'fragment') {
      const fragment = node as IRFragment
      for (const child of fragment.children) {
        this.collectNestedComponents(child, result)
      }
    } else if (node.type === 'conditional') {
      const cond = node as IRConditional
      this.collectNestedComponents(cond.whenTrue, result)
      if (cond.whenFalse) {
        this.collectNestedComponents(cond.whenFalse, result)
      }
    }
  }

  /**
   * Collect all static child component instances from the IR tree.
   * Excludes components inside loops (which are handled by nestedComponents).
   *
   * Each instance is identified by:
   * - name: Component name (e.g., "ReactiveChild")
   * - slotId: Unique slot ID (e.g., "slot_6")
   * - props: Component props
   * - fieldName: Go field name (e.g., "ReactiveChildSlot6")
   */
  private collectStaticChildInstances(node: IRNode): Array<{
    name: string
    slotId: string
    props: IRProp[]
    fieldName: string
  }> {
    const result: Array<{
      name: string
      slotId: string
      props: IRProp[]
      fieldName: string
    }> = []
    this.collectStaticChildInstancesRecursive(node, result, false)
    return result
  }

  private collectStaticChildInstancesRecursive(
    node: IRNode,
    result: Array<{ name: string; slotId: string; props: IRProp[]; fieldName: string }>,
    inLoop: boolean
  ): void {
    if (node.type === 'component') {
      const comp = node as IRComponent
      // Skip Portal components (handled separately via PortalCollector)
      // Skip components inside loops (handled by nestedComponents)
      if (comp.name !== 'Portal' && !inLoop && comp.slotId) {
        const suffix = slotIdToFieldSuffix(comp.slotId)
        result.push({
          name: comp.name,
          slotId: comp.slotId,
          props: comp.props,
          fieldName: `${comp.name}${suffix}`,
        })
      }
      // Recurse into Portal's children to find nested components
      if (comp.name === 'Portal' && comp.children) {
        for (const child of comp.children) {
          this.collectStaticChildInstancesRecursive(child, result, inLoop)
        }
      }
    } else if (node.type === 'loop') {
      const loop = node as IRLoop
      // Mark children as inside loop
      for (const child of loop.children) {
        this.collectStaticChildInstancesRecursive(child, result, true)
      }
    } else if (node.type === 'element') {
      const element = node as IRElement
      for (const child of element.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop)
      }
    } else if (node.type === 'fragment') {
      const fragment = node as IRFragment
      for (const child of fragment.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop)
      }
    } else if (node.type === 'conditional') {
      const cond = node as IRConditional
      this.collectStaticChildInstancesRecursive(cond.whenTrue, result, inLoop)
      if (cond.whenFalse) {
        this.collectStaticChildInstancesRecursive(cond.whenFalse, result, inLoop)
      }
    }
  }

  /**
   * Convert JavaScript initial value to Go value for NewXxxProps function.
   * References to props params are converted to in.FieldName format.
   */
  private convertInitialValue(value: string, typeInfo: TypeInfo, propsParams?: { name: string }[]): string {
    // Check if it's a simple identifier (props param reference)
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      // Check if this matches a props param
      if (propsParams?.some(p => p.name === value)) {
        return `in.${this.capitalizeFieldName(value)}`
      }
    }

    // Check for props.xxx pattern (e.g., "props.initial ?? 0")
    const propName = this.extractPropNameFromInitialValue(value)
    if (propName && propsParams?.some(p => p.name === propName)) {
      return `in.${this.capitalizeFieldName(propName)}`
    }

    if (typeInfo.kind === 'primitive') {
      if (typeInfo.primitive === 'boolean') {
        return value === 'true' ? 'true' : 'false'
      }
      if (typeInfo.primitive === 'number') {
        // Check if it's a simple number
        if (/^\d+$/.test(value)) return value
        if (/^\d+\.\d+$/.test(value)) return value
        return '0'
      }
      if (typeInfo.primitive === 'string') {
        // Remove quotes if present and add Go string syntax
        if (value.startsWith("'") || value.endsWith("'")) {
          return value.replace(/'/g, '"')
        }
        if (value.startsWith('"') && value.endsWith('"')) {
          return value
        }
        return '""'
      }
    }

    // For arrays, use nil for complex JS expressions
    if (typeInfo.kind === 'array') {
      // Simple array literal or empty
      if (value === '[]' || value === 'null' || value === 'undefined') {
        return 'nil'
      }
      // Complex expression - use nil as placeholder
      return 'nil'
    }

    // Default for complex expressions
    return 'nil'
  }

  /**
   * Convert TypeInfo to Go type string.
   * If type is unknown, tries to infer from defaultValue.
   */
  private typeInfoToGo(typeInfo: TypeInfo, defaultValue?: string): string {
    switch (typeInfo.kind) {
      case 'primitive':
        switch (typeInfo.primitive) {
          case 'string':
            return 'string'
          case 'number':
            return 'int'
          case 'boolean':
            return 'bool'
          default:
            return 'interface{}'
        }
      case 'array':
        if (typeInfo.elementType) {
          return `[]${this.typeInfoToGo(typeInfo.elementType)}`
        }
        return '[]interface{}'
      case 'object':
        return 'map[string]interface{}'
      case 'interface':
        // Check if raw type name matches a locally-defined type
        if (typeInfo.raw && this.localTypeNames.has(typeInfo.raw)) {
          return typeInfo.raw
        }
        // Try to parse raw type string as a known pattern (e.g., Array<Todo>)
        if (typeInfo.raw) {
          const resolved = this.tsTypeStringToGo(typeInfo.raw)
          if (resolved !== 'interface{}') return resolved
        }
        return 'interface{}'
      case 'unknown':
        // Try to infer type from default value
        if (defaultValue !== undefined) {
          return this.inferTypeFromValue(defaultValue)
        }
        return 'interface{}'
      default:
        return 'interface{}'
    }
  }

  /**
   * Get signal's initial value as Go code.
   * Handles both literal values (0, true, "str") and props references (initial).
   */
  private getSignalInitialValueAsGo(initialValue: string, propsParams: { name: string }[]): string {
    // Check if it's a props param reference
    if (propsParams.some(p => p.name === initialValue)) {
      return `in.${this.capitalizeFieldName(initialValue)}`
    }

    // Check for props.xxx pattern (e.g., "props.initial ?? 0")
    const propName = this.extractPropNameFromInitialValue(initialValue)
    if (propName && propsParams.some(p => p.name === propName)) {
      return `in.${this.capitalizeFieldName(propName)}`
    }

    // Check if it's a literal value
    // Number literals
    if (/^-?\d+$/.test(initialValue)) {
      return initialValue
    }
    if (/^-?\d+\.\d+$/.test(initialValue)) {
      return initialValue
    }
    // Boolean literals
    if (initialValue === 'true' || initialValue === 'false') {
      return initialValue
    }
    // String literals
    if ((initialValue.startsWith("'") && initialValue.endsWith("'")) ||
        (initialValue.startsWith('"') && initialValue.endsWith('"'))) {
      return initialValue.replace(/'/g, '"')
    }

    // Default: return 0 for unknown
    return '0'
  }

  /**
   * Resolve dynamic prop value (e.g., signal/memo getter calls) to Go initial value.
   * Handles expressions like `count()` → signal's initial value
   */
  private resolveDynamicPropValue(
    expr: string,
    signals: { getter: string; setter: string | null; initialValue: string; type: TypeInfo }[],
    memos: { name: string; computation: string; deps: string[] }[],
    propsParams: { name: string }[]
  ): string | null {
    // Match signal/memo getter calls like count(), doubled()
    const getterMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(\)$/)
    if (getterMatch) {
      const getterName = getterMatch[1]

      // Check if it's a signal
      const signal = signals.find(s => s.getter === getterName)
      if (signal) {
        return this.convertInitialValue(signal.initialValue, signal.type, propsParams)
      }

      // Check if it's a memo
      const memo = memos.find(m => m.name === getterName)
      if (memo) {
        return this.computeMemoInitialValue(memo, signals, propsParams)
      }
    }

    return null
  }

  /**
   * Compute the initial value for a memo based on its computation and signal initial values.
   * Handles simple cases like `() => count() * 2` → `in.Initial * 2`
   * Also handles props.xxx patterns like `() => props.value * 10` → `in.Value * 10`
   */
  private computeMemoInitialValue(
    memo: { name: string; computation: string; deps: string[] },
    signals: { getter: string; initialValue: string }[],
    propsParams: { name: string }[]
  ): string {
    const computation = memo.computation

    // Pattern: () => dep() * N or () => dep() + N etc.
    const arithmeticMatch = computation.match(/\(\)\s*=>\s*(\w+)\(\)\s*([*+\-/])\s*(\d+)/)
    if (arithmeticMatch) {
      const [, depName, operator, operand] = arithmeticMatch
      const signal = signals.find(s => s.getter === depName)
      if (signal) {
        // Get the signal's initial value in Go format
        const signalInitial = this.getSignalInitialValueAsGo(signal.initialValue, propsParams)
        return `${signalInitial} ${operator} ${operand}`
      }
    }

    // Pattern: () => props.xxx * N (for SolidJS-style props object)
    const propsArithmeticMatch = computation.match(/\(\)\s*=>\s*props\.(\w+)\s*([*+\-/])\s*(\d+)/)
    if (propsArithmeticMatch) {
      const [, propName, operator, operand] = propsArithmeticMatch
      // Check if this prop is in propsParams (passed from parent)
      const param = propsParams.find(p => p.name === propName)
      if (param) {
        return `in.${this.capitalizeFieldName(propName)} ${operator} ${operand}`
      }
    }

    // Pattern: () => dep() (just return the signal value)
    const simpleMatch = computation.match(/\(\)\s*=>\s*(\w+)\(\)$/)
    if (simpleMatch) {
      const [, depName] = simpleMatch
      const signal = signals.find(s => s.getter === depName)
      if (signal) {
        return this.getSignalInitialValueAsGo(signal.initialValue, propsParams)
      }
    }

    // Pattern: () => props.xxx (just return the prop value)
    const propsSimpleMatch = computation.match(/\(\)\s*=>\s*props\.(\w+)$/)
    if (propsSimpleMatch) {
      const [, propName] = propsSimpleMatch
      const param = propsParams.find(p => p.name === propName)
      if (param) {
        return `in.${this.capitalizeFieldName(propName)}`
      }
    }

    // Pattern: () => varName * N (for destructured props like { value })
    const varArithmeticMatch = computation.match(/\(\)\s*=>\s*(\w+)\s*([*+\-/])\s*(\d+)/)
    if (varArithmeticMatch) {
      const [, varName, operator, operand] = varArithmeticMatch
      // Check if this is a destructured prop (not a signal getter)
      const param = propsParams.find(p => p.name === varName)
      if (param) {
        return `in.${this.capitalizeFieldName(varName)} ${operator} ${operand}`
      }
    }

    // Pattern: () => varName (just return the prop value for destructured props)
    const varSimpleMatch = computation.match(/\(\)\s*=>\s*(\w+)$/)
    if (varSimpleMatch) {
      const [, varName] = varSimpleMatch
      const param = propsParams.find(p => p.name === varName)
      if (param) {
        return `in.${this.capitalizeFieldName(varName)}`
      }
    }

    // Default: return 0 for unknown computations
    return '0'
  }

  /**
   * Infer the Go type for a memo based on its computation and dependencies.
   */
  private inferMemoType(
    memo: { name: string; computation: string; type: TypeInfo; deps: string[] },
    signals: { getter: string; initialValue: string; type: TypeInfo }[],
    propsParamMap: Map<string, { name: string; type: TypeInfo; defaultValue?: string }>
  ): string {
    // Check if computation involves multiplication (*) - likely number
    if (memo.computation.includes('*') || memo.computation.includes('/') ||
        memo.computation.includes('+') || memo.computation.includes('-')) {
      // Check if deps are number-typed signals
      for (const dep of memo.deps) {
        const signal = signals.find(s => s.getter === dep)
        if (signal) {
          let referencedProp = propsParamMap.get(signal.initialValue)
          if (!referencedProp) {
            const propName = this.extractPropNameFromInitialValue(signal.initialValue)
            if (propName) referencedProp = propsParamMap.get(propName)
          }
          if (referencedProp) {
            const propType = this.typeInfoToGo(referencedProp.type, referencedProp.defaultValue)
            if (propType === 'int' || propType === 'float64') {
              return 'int'
            }
          }
          // Check signal's own initial value
          const signalType = this.typeInfoToGo(signal.type, signal.initialValue)
          if (signalType === 'int' || signalType === 'float64') {
            return 'int'
          }
        }
      }
    }

    // Default to the memo's declared type
    return this.typeInfoToGo(memo.type)
  }

  /**
   * Infer Go type from a JavaScript value literal.
   */
  private inferTypeFromValue(value: string): string {
    // Boolean literals
    if (value === 'true' || value === 'false') return 'bool'
    // Number literals (int)
    if (/^-?\d+$/.test(value)) return 'int'
    // Number literals (float)
    if (/^-?\d+\.\d+$/.test(value)) return 'float64'
    // String literals
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      return 'string'
    }
    // Empty string
    if (value === '""' || value === "''") return 'string'
    // Array literals
    if (value.startsWith('[')) return '[]interface{}'
    // Default
    return 'interface{}'
  }

  /**
   * Extract prop name from a signal's initialValue that uses props.xxx pattern.
   * e.g., "props.initial ?? 0" → "initial", "props.checked" → "checked"
   */
  private extractPropNameFromInitialValue(initialValue: string): string | null {
    if (!this.propsObjectName) return null
    const trimmed = initialValue.trim()
    const name = this.propsObjectName

    // "props.initial ?? 0", "props.checked", "p.value || ''"
    const direct = new RegExp(`^${name}\\.(\\w+)(?:\\s*(?:\\?\\?|\\|\\|)\\s*.+)?$`)
    const m1 = trimmed.match(direct)
    if (m1) return m1[1]

    // "(props.initialTodos ?? []).map(...)"
    const wrapped = new RegExp(`^\\(${name}\\.(\\w+)\\s*(?:\\?\\?|\\|\\|)\\s*[^)]+\\)`)
    const m2 = trimmed.match(wrapped)
    if (m2) return m2[1]

    return null
  }

  /** Go common initialisms that should be fully uppercased (https://go.dev/wiki/CodeReviewComments#initialisms) */
  private static GO_INITIALISMS = new Set([
    'id', 'url', 'http', 'https', 'api', 'json', 'xml', 'html', 'css', 'sql',
    'ip', 'tcp', 'udp', 'dns', 'ssh', 'tls', 'ssl', 'uri', 'uid', 'uuid',
    'ascii', 'utf8', 'eof', 'grpc', 'rpc', 'cpu', 'gpu', 'ram', 'os',
  ])

  private capitalizeFieldName(name: string): string {
    if (!name) return name
    // Check if the entire name is a Go initialism (e.g., 'id' → 'ID')
    if (GoTemplateAdapter.GO_INITIALISMS.has(name.toLowerCase())) {
      return name.toUpperCase()
    }
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  /**
   * Convert a JavaScript literal value to Go literal syntax.
   */
  private goLiteral(value: string): string {
    // Boolean
    if (value === 'true' || value === 'false') return value
    // Number
    if (/^-?\d+(\.\d+)?$/.test(value)) return value
    // String with single quotes -> Go double quotes
    if (value.startsWith("'") && value.endsWith("'")) {
      return `"${value.slice(1, -1)}"`
    }
    // String with double quotes -> keep as is
    if (value.startsWith('"') && value.endsWith('"')) {
      return value
    }
    // Default: wrap in quotes
    return `"${value}"`
  }

  renderNode(node: IRNode, ctx?: { isRootOfClientComponent?: boolean }): string {
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
        return this.renderComponent(node, ctx)
      case 'fragment':
        return this.renderFragment(node as IRFragment)
      case 'slot':
        return this.renderSlot(node as IRSlot)
      case 'if-statement':
        return this.renderIfStatement(node as IRIfStatement, ctx)
      case 'provider':
        return this.renderChildren((node as IRProvider).children)
      case 'async':
        return this.renderAsync(node as IRAsync)
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
      hydrationAttrs += ` ${this.renderScopeMarker('.ScopeID')}`
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

  renderExpression(expr: IRExpression): string {
    // Handle @client directive - render comment marker for client-side evaluation
    // The expression will be evaluated in ClientJS via updateClientMarker()
    if (expr.clientOnly) {
      if (expr.slotId) {
        return `{{bfComment "client:${expr.slotId}"}}`
      }
      return ''
    }

    const goExpr = this.convertExpressionToGo(expr.expr)

    // If the expression already contains Go template blocks (e.g., {{with ...}}),
    // don't wrap it again in {{...}} to avoid double-wrapping.
    // Use comment markers instead of <span> to avoid changing DOM structure.
    if (goExpr.startsWith('{{')) {
      if (expr.slotId) {
        return `{{bfTextStart "${expr.slotId}"}}${goExpr}{{bfTextEnd}}`
      }
      return goExpr
    }

    // Mark expressions with slotId using comment nodes for client JS to find.
    // This includes reactive expressions AND loop-param-dependent expressions.
    if (expr.slotId) {
      return `{{bfTextStart "${expr.slotId}"}}{{${goExpr}}}{{bfTextEnd}}`
    }

    return `{{${goExpr}}}`
  }

  /**
   * Render a client-only conditional as comment markers.
   * Used when @client directive is applied to an unsupported conditional.
   * The condition is evaluated on the client side via insert().
   */
  private renderClientOnlyConditional(cond: IRConditional): string {
    if (cond.slotId) {
      // Render comment markers (empty initially, client will populate)
      return `{{bfComment "cond-start:${cond.slotId}"}}{{bfComment "cond-end:${cond.slotId}"}}`
    }
    return ''
  }

  /**
   * Render a ParsedExpr to Go template syntax.
   */
  private renderParsedExpr(expr: ParsedExpr): string {
    switch (expr.kind) {
      case 'identifier':
        return `.${this.capitalizeFieldName(expr.name)}`

      case 'literal':
        if (expr.literalType === 'string') {
          return `"${expr.value}"`
        }
        if (expr.literalType === 'null') {
          return '""'
        }
        return String(expr.value)

      case 'call': {
        // Handle signal calls: count() -> .Count
        if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
          return `.${this.capitalizeFieldName(expr.callee.name)}`
        }
        // Handle method calls on objects: items().length is handled by member
        // For other calls, render callee and args
        const callee = this.renderParsedExpr(expr.callee)
        if (expr.args.length === 0) {
          return callee
        }
        // Function calls with args - this is unusual in templates
        const args = expr.args.map(a => this.renderParsedExpr(a)).join(' ')
        return `${callee} ${args}`
      }

      case 'member': {
        // Handle .length with higher-order filter → len (bf_filter ...)
        if (expr.property === 'length' && expr.object.kind === 'higher-order') {
          const result = this.renderFilterLengthExpr(expr.object, e => this.renderParsedExpr(e))
          if (result) {
            return result
          }
        }

        // Handle find().property → {{with bf_find ...}}{{.Property}}{{end}}
        if (expr.object.kind === 'higher-order' && expr.object.method === 'find') {
          const findResult = this.renderHigherOrderExpr(expr.object, e => this.renderParsedExpr(e))
          if (findResult) {
            return `{{with ${findResult}}}{{.${this.capitalizeFieldName(expr.property)}}}{{end}}`
          }
          // Fall back to template iteration for complex predicates
          const templateBlock = this.renderFindTemplateBlock(
            expr.object, e => this.renderParsedExpr(e), this.capitalizeFieldName(expr.property)
          )
          if (templateBlock) return templateBlock
        }

        // Handle SolidJS-style props pattern: props.xxx -> .Xxx
        // When object is the propsObjectName (e.g., "props"), skip the object part
        // and directly access the property on the root context
        if (expr.object.kind === 'identifier' && this.propsObjectName && expr.object.name === this.propsObjectName) {
          return `.${this.capitalizeFieldName(expr.property)}`
        }

        // Inside a loop, the loop param variable refers to the current item (dot).
        // e.g., `msg.role` inside `{{range $_, $msg := .Messages}}` → `.Role`
        const currentLoopParam = this.loopParamStack[this.loopParamStack.length - 1]
        if (expr.object.kind === 'identifier' && currentLoopParam && expr.object.name === currentLoopParam) {
          return `.${this.capitalizeFieldName(expr.property)}`
        }

        const obj = this.renderParsedExpr(expr.object)
        // Handle .length -> len
        if (expr.property === 'length') {
          return `len ${obj}`
        }
        // Normal property access: .User.Name
        return `${obj}.${this.capitalizeFieldName(expr.property)}`
      }

      case 'binary': {
        const left = this.renderParsedExpr(expr.left)
        const right = this.renderParsedExpr(expr.right)

        // Comparison operators -> Go template functions
        switch (expr.op) {
          case '===':
          case '==':
            return `eq ${left} ${right}`
          case '!==':
          case '!=':
            return `ne ${left} ${right}`
          case '>':
            return `gt ${left} ${right}`
          case '<':
            return `lt ${left} ${right}`
          case '>=':
            return `ge ${left} ${right}`
          case '<=':
            return `le ${left} ${right}`

          // Arithmetic operators -> runtime functions
          case '+':
            return `bf_add ${left} ${right}`
          case '-':
            return `bf_sub ${left} ${right}`
          case '*':
            return `bf_mul ${left} ${right}`
          case '/':
            return `bf_div ${left} ${right}`
          case '%':
            return `bf_mod ${left} ${right}`

          default:
            return `${left} ${expr.op} ${right}`
        }
      }

      case 'unary': {
        const arg = this.renderParsedExpr(expr.argument)
        if (expr.op === '!') {
          return `not ${arg}`
        }
        if (expr.op === '-') {
          return `bf_neg ${arg}`
        }
        return arg
      }

      case 'logical': {
        const left = this.renderParsedExpr(expr.left)
        const right = this.renderParsedExpr(expr.right)
        // Wrap in parentheses if needed for complex expressions
        const wrapLeft = this.needsParens(expr.left) ? `(${left})` : left
        const wrapRight = this.needsParens(expr.right) ? `(${right})` : right
        if (expr.op === '&&') {
          return `and ${wrapLeft} ${wrapRight}`
        }
        return `or ${wrapLeft} ${wrapRight}`
      }

      case 'conditional': {
        const test = this.renderParsedExpr(expr.test)
        // Nested conditionals already return complete {{if}}...{{end}} blocks
        // Literals return bare text (used within attributes)
        const consequent = this.renderConditionalBranch(expr.consequent)
        const alternate = this.renderConditionalBranch(expr.alternate)
        return `{{if ${test}}}${consequent}{{else}}${alternate}{{end}}`
      }

      case 'template-literal': {
        let result = ''
        for (const part of expr.parts) {
          if (part.type === 'string') {
            result += part.value
          } else {
            const partExpr = this.renderParsedExpr(part.expr)
            result += `{{${partExpr}}}`
          }
        }
        return result
      }

      case 'arrow-fn':
        // Arrow functions shouldn't appear standalone in rendering
        return `[ARROW-FN: ${expr.param} => ...]`

      case 'higher-order': {
        const result = this.renderHigherOrderExpr(expr, e => this.renderParsedExpr(e))
        if (result) return result
        if (expr.method === 'find' || expr.method === 'findIndex') {
          const templateBlock = this.renderFindTemplateBlock(expr, e => this.renderParsedExpr(e))
          if (templateBlock) return templateBlock
        }
        if (expr.method === 'every' || expr.method === 'some') {
          const templateBlock = this.renderEverySomeTemplateBlock(expr, e => this.renderParsedExpr(e))
          if (templateBlock) return templateBlock
        }
        return `[UNSUPPORTED: ${expr.method}]`
      }

      case 'unsupported':
        // This should not happen if isSupported was checked
        return `[UNSUPPORTED: ${expr.raw}]`
    }
  }

  /**
   * Extract field name and negation from a simple predicate.
   * t => t.done → { field: "Done", negated: false }
   * t => !t.done → { field: "Done", negated: true }
   */
  private extractFieldPredicate(pred: ParsedExpr, param: string): { field: string | null; negated: boolean } {
    // t.done
    if (pred.kind === 'member' && pred.object.kind === 'identifier' && pred.object.name === param) {
      return { field: this.capitalizeFieldName(pred.property), negated: false }
    }
    // !t.done
    if (pred.kind === 'unary' && pred.op === '!' && pred.argument.kind === 'member') {
      const mem = pred.argument
      if (mem.object.kind === 'identifier' && mem.object.name === param) {
        return { field: this.capitalizeFieldName(mem.property), negated: true }
      }
    }
    return { field: null, negated: false }
  }

  /**
   * Extract field name and value from an equality predicate.
   * Extends extractFieldPredicate to also handle equality comparisons.
   *
   * t.done → { field: "Done", value: "true" }
   * !t.done → { field: "Done", value: "false" }
   * u.id === selectedId() → { field: "Id", value: <rendered expr> }
   * selectedId() === u.id → same (supports both operand orders)
   */
  private extractEqualityPredicate(
    pred: ParsedExpr,
    param: string,
    renderValue: (e: ParsedExpr) => string
  ): { field: string; value: string } | null {
    // Boolean field: t.done → { field: "Done", value: "true" }
    if (pred.kind === 'member' && pred.object.kind === 'identifier' && pred.object.name === param) {
      return { field: this.capitalizeFieldName(pred.property), value: 'true' }
    }
    // Negated boolean: !t.done → { field: "Done", value: "false" }
    if (pred.kind === 'unary' && pred.op === '!' && pred.argument.kind === 'member') {
      const mem = pred.argument
      if (mem.object.kind === 'identifier' && mem.object.name === param) {
        return { field: this.capitalizeFieldName(mem.property), value: 'false' }
      }
    }
    // Equality: u.id === expr or expr === u.id
    if (pred.kind === 'binary' && (pred.op === '===' || pred.op === '==')) {
      // Left is param.field
      if (pred.left.kind === 'member' && pred.left.object.kind === 'identifier' && pred.left.object.name === param) {
        return { field: this.capitalizeFieldName(pred.left.property), value: renderValue(pred.right) }
      }
      // Right is param.field (reversed operand order)
      if (pred.right.kind === 'member' && pred.right.object.kind === 'identifier' && pred.right.object.name === param) {
        return { field: this.capitalizeFieldName(pred.right.property), value: renderValue(pred.left) }
      }
    }
    return null
  }

  /**
   * Render a higher-order expression (filter, every, some, find, findIndex) to Go template.
   * Returns null if the expression is not supported.
   *
   * @param expr - The higher-order expression
   * @param renderArray - Function to render the array expression (allows recursion via different methods)
   */
  private renderHigherOrderExpr(
    expr: Extract<ParsedExpr, { kind: 'higher-order' }>,
    renderArray: (e: ParsedExpr) => string
  ): string | null {
    const arrayExpr = renderArray(expr.object)

    if (expr.method === 'every' || expr.method === 'some') {
      const { field } = this.extractFieldPredicate(expr.predicate, expr.param)
      if (!field) return null
      return expr.method === 'every'
        ? `bf_every ${arrayExpr} "${field}"`
        : `bf_some ${arrayExpr} "${field}"`
    }

    if (expr.method === 'filter') {
      const { field, negated } = this.extractFieldPredicate(expr.predicate, expr.param)
      if (!field) return null
      const value = negated ? 'false' : 'true'
      return `bf_filter ${arrayExpr} "${field}" ${value}`
    }

    if (expr.method === 'find' || expr.method === 'findIndex') {
      const eqPred = this.extractEqualityPredicate(
        expr.predicate, expr.param, e => this.renderParsedExpr(e)
      )
      if (!eqPred) return null
      const func = expr.method === 'find' ? 'bf_find' : 'bf_find_index'
      return `${func} ${arrayExpr} "${eqPred.field}" ${eqPred.value}`
    }

    return null
  }

  /**
   * Render find()/findIndex() with complex predicates using {{range}}{{if}}...{{break}} blocks.
   * Falls back from bf_find/bf_find_index when extractEqualityPredicate returns null.
   * Reuses renderFilterExpr for condition rendering.
   *
   * @param expr - The higher-order find/findIndex expression
   * @param renderArray - Function to render the array expression
   * @param propertyAccess - Optional property to access on the found element (for find().property)
   */
  private renderFindTemplateBlock(
    expr: Extract<ParsedExpr, { kind: 'higher-order' }>,
    renderArray: (e: ParsedExpr) => string,
    propertyAccess?: string
  ): string | null {
    const arrayExpr = renderArray(expr.object)
    const condition = this.renderFilterExpr(expr.predicate, expr.param)
    if (condition.includes('[UNSUPPORTED')) return null

    if (expr.method === 'find') {
      const output = propertyAccess ? `{{.${propertyAccess}}}` : '{{.}}'
      return `{{range ${arrayExpr}}}{{if ${condition}}}${output}{{break}}{{end}}{{end}}`
    }

    if (expr.method === 'findIndex') {
      return `{{range $i, $_ := ${arrayExpr}}}{{if ${condition}}}{{$i}}{{break}}{{end}}{{end}}`
    }

    return null
  }

  /**
   * Render every()/some() with complex predicates using {{range}}{{if}} with variable reassignment.
   * Falls back from bf_every/bf_some when extractFieldPredicate returns null.
   * Reuses renderFilterExpr for condition rendering.
   *
   * every: start true, set false on first failure, break early
   * some: start false, set true on first match, break early
   *
   * @param expr - The higher-order every/some expression
   * @param renderArray - Function to render the array expression
   */
  private renderEverySomeTemplateBlock(
    expr: Extract<ParsedExpr, { kind: 'higher-order' }>,
    renderArray: (e: ParsedExpr) => string
  ): string | null {
    const arrayExpr = renderArray(expr.object)
    const condition = this.renderFilterExpr(expr.predicate, expr.param)
    if (condition.includes('[UNSUPPORTED')) return null

    if (expr.method === 'every') {
      // Negate condition: if NOT condition, set false and break
      const negated = this.negateGoCondition(condition)
      return `{{$bf_result := true}}{{range ${arrayExpr}}}{{if ${negated}}}{{$bf_result = false}}{{break}}{{end}}{{end}}{{$bf_result}}`
    }

    if (expr.method === 'some') {
      return `{{$bf_result := false}}{{range ${arrayExpr}}}{{if ${condition}}}{{$bf_result = true}}{{break}}{{end}}{{end}}{{$bf_result}}`
    }

    return null
  }

  /**
   * Negate a Go template condition.
   * Wraps in `not (...)` when the condition is a Go function call (eq, ne, gt, etc.),
   * otherwise uses `not condition`.
   */
  private negateGoCondition(condition: string): string {
    const goFuncPattern = /^(eq|ne|gt|lt|ge|le|and|or|not|bf_)\b/
    if (goFuncPattern.test(condition)) {
      return `not (${condition})`
    }
    return `not ${condition}`
  }

  /**
   * Render .length on a filter higher-order expression.
   * e.g., todos().filter(t => !t.done).length → len (bf_filter .Todos "Done" false)
   *
   * @param filterExpr - The filter higher-order expression
   * @param renderArray - Function to render the array expression
   */
  private renderFilterLengthExpr(
    filterExpr: Extract<ParsedExpr, { kind: 'higher-order' }>,
    renderArray: (e: ParsedExpr) => string
  ): string | null {
    if (filterExpr.method !== 'filter') {
      return null
    }

    const { field, negated } = this.extractFieldPredicate(filterExpr.predicate, filterExpr.param)
    if (!field) {
      return null
    }

    const arrayExpr = renderArray(filterExpr.object)
    const value = negated ? 'false' : 'true'
    return `len (bf_filter ${arrayExpr} "${field}" ${value})`
  }

  /**
   * Render a predicate expression for use in Go template {{if}} conditions.
   * Substitutes the loop parameter (e.g., 't' in 't.done') with dot notation.
   */
  private renderPredicateCondition(pred: ParsedExpr, param: string): string {
    return this.renderFilterExpr(pred, param)
  }

  /**
   * Check if expression needs parentheses when used in and/or.
   */
  private needsParens(expr: ParsedExpr): boolean {
    return expr.kind === 'logical' || expr.kind === 'unary' || expr.kind === 'conditional'
  }

  // =============================================================================
  // Block Body Condition Rendering
  // =============================================================================

  /**
   * Render block body filter into a single Go template condition.
   *
   * Example block body:
   * ```
   * filter(t => {
   *   const f = filter()
   *   if (f === 'active') return !t.done
   *   if (f === 'completed') return t.done
   *   return true
   * })
   * ```
   *
   * Becomes:
   * ```
   * or (and (eq $.Filter "active") (not .Done))
   *    (and (eq $.Filter "completed") .Done)
   *    (and (ne $.Filter "active") (ne $.Filter "completed"))
   * ```
   */
  private renderBlockBodyCondition(
    statements: ParsedStatement[],
    param: string
  ): string {
    // Build a map of local variables to their signal sources
    // e.g., { f: 'filter' } when we see `const f = filter()`
    const localVarMap = new Map<string, string>()

    // Collect all return paths through the block body
    const paths = this.collectReturnPaths(statements, [], localVarMap, param)

    if (paths.length === 0) {
      // No return paths found, default to true
      return 'true'
    }

    if (paths.length === 1) {
      // Single path: render conditions with AND, then check result
      const path = paths[0]
      return this.buildSinglePathCondition(path, param, localVarMap)
    }

    // Multiple paths: build OR condition
    return this.buildOrCondition(paths, param, localVarMap)
  }

  /**
   * Recursively collect all return paths through the statements.
   * Returns an array of ReturnPath objects.
   */
  private collectReturnPaths(
    statements: ParsedStatement[],
    currentConditions: ParsedExpr[],
    localVarMap: Map<string, string>,
    param: string
  ): Array<{ conditions: ParsedExpr[]; result: ParsedExpr }> {
    const paths: Array<{ conditions: ParsedExpr[]; result: ParsedExpr }> = []

    for (const stmt of statements) {
      if (stmt.kind === 'var-decl') {
        // Track local variable to signal mapping
        // e.g., const f = filter() -> f maps to 'filter'
        if (stmt.init.kind === 'call' && stmt.init.callee.kind === 'identifier') {
          localVarMap.set(stmt.name, stmt.init.callee.name)
        }
      } else if (stmt.kind === 'return') {
        // This is a return path
        paths.push({
          conditions: [...currentConditions],
          result: stmt.value
        })
        // After a return, subsequent statements in this branch are unreachable
        break
      } else if (stmt.kind === 'if') {
        // If statement: collect paths from both branches
        const thenConditions = [...currentConditions, stmt.condition]
        const thenPaths = this.collectReturnPaths(stmt.consequent, thenConditions, localVarMap, param)
        paths.push(...thenPaths)

        if (stmt.alternate) {
          // Negate the condition for the else branch
          const negatedCondition: ParsedExpr = { kind: 'unary', op: '!', argument: stmt.condition }
          const elseConditions = [...currentConditions, negatedCondition]
          const elsePaths = this.collectReturnPaths(stmt.alternate, elseConditions, localVarMap, param)
          paths.push(...elsePaths)
        } else {
          // No else branch: implicit fall-through (continue to next statement)
          // Need to track the negated condition for subsequent statements
          const negatedCondition: ParsedExpr = { kind: 'unary', op: '!', argument: stmt.condition }
          currentConditions.push(negatedCondition)
        }
      }
    }

    return paths
  }

  /**
   * Build a condition for a single return path.
   */
  private buildSinglePathCondition(
    path: { conditions: ParsedExpr[]; result: ParsedExpr },
    param: string,
    localVarMap: Map<string, string>
  ): string {
    // If result is a literal boolean
    if (path.result.kind === 'literal' && path.result.literalType === 'boolean') {
      if (path.result.value === true) {
        // Return true: the conditions themselves determine visibility
        if (path.conditions.length === 0) {
          return 'true'
        }
        return this.renderConditionsAnd(path.conditions, param, localVarMap)
      } else {
        // Return false: this path should NOT match
        return 'false'
      }
    }

    // Non-boolean result: combine conditions AND result
    if (path.conditions.length === 0) {
      return this.renderFilterExpr(path.result, param, localVarMap)
    }

    const condPart = this.renderConditionsAnd(path.conditions, param, localVarMap)
    const resultPart = this.renderFilterExpr(path.result, param, localVarMap)
    return `and (${condPart}) (${resultPart})`
  }

  /**
   * Build an OR condition from multiple return paths.
   */
  private buildOrCondition(
    paths: Array<{ conditions: ParsedExpr[]; result: ParsedExpr }>,
    param: string,
    localVarMap: Map<string, string>
  ): string {
    const parts: string[] = []

    for (const path of paths) {
      // Skip paths that always return false
      if (path.result.kind === 'literal' && path.result.literalType === 'boolean' && path.result.value === false) {
        continue
      }

      const pathCond = this.buildSinglePathCondition(path, param, localVarMap)
      if (pathCond !== 'false') {
        parts.push(pathCond)
      }
    }

    if (parts.length === 0) {
      return 'false'
    }
    if (parts.length === 1) {
      return parts[0]
    }

    // Wrap each part in parentheses for clarity
    return `or ${parts.map(p => `(${p})`).join(' ')}`
  }

  /**
   * Render multiple conditions combined with AND.
   */
  private renderConditionsAnd(
    conditions: ParsedExpr[],
    param: string,
    localVarMap: Map<string, string>
  ): string {
    if (conditions.length === 0) {
      return 'true'
    }
    if (conditions.length === 1) {
      return this.renderFilterExpr(conditions[0], param, localVarMap)
    }

    const parts = conditions.map(c => this.renderFilterExpr(c, param, localVarMap))
    // Build nested and: and (a) (and (b) (c))
    let result = parts[parts.length - 1]
    for (let i = parts.length - 2; i >= 0; i--) {
      result = `and (${parts[i]}) (${result})`
    }
    return result
  }

  /**
   * Unified method for rendering filter predicate expressions.
   * Used for both expression body (t => !t.done) and block body filters.
   *
   * @param expr - The parsed expression to render
   * @param param - The loop parameter name (e.g., 't' in filter(t => ...))
   * @param localVarMap - Optional map of local variables to signal names (for block body)
   */
  private renderFilterExpr(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string> = new Map()
  ): string {
    switch (expr.kind) {
      case 'identifier': {
        // Check if it's the loop param
        if (expr.name === param) {
          return '.'
        }
        // Check if it's a local variable mapped to a signal
        const signal = localVarMap.get(expr.name)
        if (signal) {
          return `$.${this.capitalizeFieldName(signal)}`
        }
        return `.${this.capitalizeFieldName(expr.name)}`
      }

      case 'literal':
        if (expr.literalType === 'string') {
          return `"${expr.value}"`
        }
        if (expr.literalType === 'null') {
          return '""'
        }
        return String(expr.value)

      case 'member': {
        // t.done -> .Done
        if (expr.object.kind === 'identifier' && expr.object.name === param) {
          return `.${this.capitalizeFieldName(expr.property)}`
        }
        // Nested member access or local var.prop
        const obj = this.renderFilterExpr(expr.object, param, localVarMap)
        return `${obj}.${this.capitalizeFieldName(expr.property)}`
      }

      case 'call': {
        // Handle calls like t.isDone() -> .IsDone
        if (expr.callee.kind === 'member' && expr.callee.object.kind === 'identifier' && expr.callee.object.name === param) {
          return `.${this.capitalizeFieldName(expr.callee.property)}`
        }
        // Signal calls: filter() -> $.Filter
        if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
          return `$.${this.capitalizeFieldName(expr.callee.name)}`
        }
        return this.renderFilterExpr(expr.callee, param, localVarMap)
      }

      case 'unary': {
        const arg = this.renderFilterExpr(expr.argument, param, localVarMap)
        if (expr.op === '!') {
          // Wrap in parens if arg is a function call (eq, ne, gt, etc.) for Go template syntax
          const needsParens = this.isGoFunctionCall(expr.argument)
          return needsParens ? `not (${arg})` : `not ${arg}`
        }
        if (expr.op === '-') {
          return `bf_neg ${arg}`
        }
        return arg
      }

      case 'binary': {
        const left = this.renderFilterExpr(expr.left, param, localVarMap)
        const right = this.renderFilterExpr(expr.right, param, localVarMap)

        switch (expr.op) {
          case '===':
          case '==':
            return `eq ${left} ${right}`
          case '!==':
          case '!=':
            return `ne ${left} ${right}`
          case '>':
            return `gt ${left} ${right}`
          case '<':
            return `lt ${left} ${right}`
          case '>=':
            return `ge ${left} ${right}`
          case '<=':
            return `le ${left} ${right}`
          case '+':
            return `bf_add ${left} ${right}`
          case '-':
            return `bf_sub ${left} ${right}`
          case '*':
            return `bf_mul ${left} ${right}`
          case '/':
            return `bf_div ${left} ${right}`
          default:
            return `${left} ${expr.op} ${right}`
        }
      }

      case 'logical': {
        const left = this.renderFilterExpr(expr.left, param, localVarMap)
        const right = this.renderFilterExpr(expr.right, param, localVarMap)
        if (expr.op === '&&') {
          return `and (${left}) (${right})`
        }
        return `or (${left}) (${right})`
      }

      default:
        return '[UNSUPPORTED-FILTER-EXPR]'
    }
  }

  /**
   * Check if a ParsedExpr will render as a Go template function call.
   * Used to determine if parentheses are needed around the expression.
   */
  private isGoFunctionCall(expr: ParsedExpr): boolean {
    switch (expr.kind) {
      case 'binary':
        // Comparison operators become function calls (eq, ne, gt, lt, etc.)
        return ['===', '==', '!==', '!=', '>', '<', '>=', '<='].includes(expr.op)
      case 'logical':
        // Logical operators become function calls (and, or)
        return true
      case 'unary':
        // Unary operators become function calls (not, bf_neg)
        return true
      case 'member':
        // .length becomes len function call
        return expr.property === 'length'
      default:
        return false
    }
  }

  /**
   * Render a branch of a conditional expression.
   * String literals render as bare text (no quotes).
   * Nested conditionals render as complete {{if}}...{{end}} blocks.
   */
  private renderConditionalBranch(expr: ParsedExpr): string {
    if (expr.kind === 'literal' && expr.literalType === 'string') {
      // String literals return as bare text
      return String(expr.value)
    }
    if (expr.kind === 'conditional') {
      // Nested ternary renders as complete Go template block
      const test = this.renderParsedExpr(expr.test)
      const consequent = this.renderConditionalBranch(expr.consequent)
      const alternate = this.renderConditionalBranch(expr.alternate)
      return `{{if ${test}}}${consequent}{{else}}${alternate}{{end}}`
    }
    // Other expressions render normally with {{...}} wrapper
    return `{{${this.renderParsedExpr(expr)}}}`
  }

  /**
   * Check if a ParsedExpr renders to a Go template function call that needs parentheses.
   * In Go templates, function calls like `len .X` or `bf_add .A .B` need parentheses
   * when used as arguments to comparison operators (eq, gt, lt, etc.).
   */
  private needsParensInGoTemplate(expr: ParsedExpr): boolean {
    switch (expr.kind) {
      case 'member':
        // .length becomes `len .X` which is a function call
        return expr.property === 'length'

      case 'binary':
        // Arithmetic operators become function calls (bf_add, bf_sub, etc.)
        return ['+', '-', '*', '/', '%'].includes(expr.op)

      case 'unary':
        // Negation becomes `bf_neg .X`
        return expr.op === '-'

      default:
        return false
    }
  }

  /**
   * Convert a JS expression to Go template syntax.
   */
  private convertExpressionToGo(jsExpr: string): string {
    const trimmed = jsExpr.trim()

    // Handle null/undefined specially
    if (trimmed === 'null' || trimmed === 'undefined') {
      return '""'
    }

    const parsed = parseExpression(trimmed)
    const support = isSupported(parsed)

    if (!support.supported) {
      // Log error and return Go template comment (safe for parsing)
      this.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Expression not supported: ${trimmed}`,
        loc: this.makeLoc(),
        suggestion: {
          message: support.reason
            ? `${support.reason}\n\nOptions:\n1. Use @client directive for client-side evaluation\n2. Pre-compute the value in Go code`
            : 'Options:\n1. Use @client directive for client-side evaluation\n2. Pre-compute the value in Go code',
        },
      })
      // Return empty string - Go template comments must be separate actions
      return `""`
    }

    return this.renderParsedExpr(parsed)
  }

  /**
   * Create a source location for error reporting.
   */
  private makeLoc(): SourceLocation {
    return {
      file: this.componentName + '.tsx',
      start: { line: 1, column: 0 },
      end: { line: 1, column: 0 },
    }
  }

  private renderIfStatement(ifStmt: IRIfStatement, ctx?: { isRootOfClientComponent?: boolean }): string {
    const { condition: goCondition, preamble } = this.convertConditionToGo(ifStmt.condition)
    const consequent = this.renderNode(ifStmt.consequent, ctx)
    let result = `${preamble}{{if ${goCondition}}}${consequent}`

    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        const altIfStmt = ifStmt.alternate as IRIfStatement
        const { condition: altCondition, preamble: altPreamble } = this.convertConditionToGo(altIfStmt.condition)
        if (altPreamble) {
          // Preamble in else-if context is not supported
          this.errors.push({
            code: 'BF102',
            severity: 'error',
            message: `Complex predicate in else-if is not supported: ${altIfStmt.condition}`,
            loc: this.makeLoc(),
            suggestion: {
              message: 'Options:\n1. Use @client directive for client-side evaluation\n2. Pre-compute the value in Go code',
            },
          })
        }
        const altConsequent = this.renderNode(altIfStmt.consequent, ctx)
        result += `{{else if ${altCondition}}}${altConsequent}`
        if (altIfStmt.alternate) {
          const altElse = this.renderNode(altIfStmt.alternate, ctx)
          result += `{{else}}${altElse}`
        }
      } else {
        const alternate = this.renderNode(ifStmt.alternate, ctx)
        result += `{{else}}${alternate}`
      }
    }

    result += '{{end}}'
    return result
  }

  renderConditional(cond: IRConditional): string {
    // Handle @client directive - render as comment markers for client-side evaluation
    if (cond.clientOnly) {
      return this.renderClientOnlyConditional(cond)
    }

    const { condition: goCondition, preamble } = this.convertConditionToGo(cond.condition)
    const whenTrue = this.renderNode(cond.whenTrue)

    // If reactive (has slotId), wrap each branch with cond marker
    if (cond.slotId) {
      const whenTrueWrapped = this.wrapWithCondMarker(whenTrue, cond.slotId)
      let result = `${preamble}{{if ${goCondition}}}${whenTrueWrapped}`

      if (cond.whenFalse) {
        // Handle null/undefined branches with empty comment markers for client hydration
        if (cond.whenFalse.type === 'expression') {
          const exprNode = cond.whenFalse as IRExpression
          if (exprNode.expr === 'null' || exprNode.expr === 'undefined') {
            // Output empty comment markers so client can insert content later
            const emptyMarkers = `{{bfComment "cond-start:${cond.slotId}"}}{{bfComment "cond-end:${cond.slotId}"}}`
            result += `{{else}}${emptyMarkers}`
          } else {
            const whenFalse = this.renderNode(cond.whenFalse)
            const whenFalseWrapped = this.wrapWithCondMarker(whenFalse, cond.slotId)
            result += `{{else}}${whenFalseWrapped}`
          }
        } else {
          const whenFalse = this.renderNode(cond.whenFalse)
          const whenFalseWrapped = this.wrapWithCondMarker(whenFalse, cond.slotId)
          result += `{{else}}${whenFalseWrapped}`
        }
      }

      result += '{{end}}'
      return result
    }

    // Non-reactive: original logic
    let result = `${preamble}{{if ${goCondition}}}${whenTrue}`

    if (cond.whenFalse && cond.whenFalse.type !== 'expression') {
      const whenFalse = this.renderNode(cond.whenFalse)
      if (whenFalse && whenFalse !== '{{""}}') {
        result += `{{else}}${whenFalse}`
      }
    } else if (cond.whenFalse && cond.whenFalse.type === 'expression') {
      const exprNode = cond.whenFalse as IRExpression
      if (exprNode.expr !== 'null' && exprNode.expr !== 'undefined') {
        const whenFalse = this.renderNode(cond.whenFalse)
        if (whenFalse && whenFalse !== '{{""}}') {
          result += `{{else}}${whenFalse}`
        }
      }
    }

    result += '{{end}}'
    return result
  }

  /**
   * Convert a JS condition to Go template condition syntax.
   * Returns { condition, preamble } where preamble contains template blocks
   * that must be emitted before the {{if}} (e.g., every/some range blocks).
   */
  private convertConditionToGo(jsCondition: string): { condition: string; preamble: string } {
    const trimmed = jsCondition.trim()
    const parsed = parseExpression(trimmed)
    const support = isSupported(parsed)

    if (!support.supported) {
      this.errors.push({
        code: 'BF102',
        severity: 'error',
        message: `Condition not supported: ${trimmed}`,
        loc: this.makeLoc(),
        suggestion: {
          message: support.reason
            ? `${support.reason}\n\nOptions:\n1. Use @client directive for client-side evaluation\n2. Pre-compute the value in Go code`
            : 'Expression contains unsupported syntax',
        },
      })
      // Return false - Go template comments must be separate actions
      return { condition: `false`, preamble: '' }
    }

    const rendered = this.renderConditionExpr(parsed)

    // Detect template blocks (e.g., from every/some with complex predicates).
    // These cannot be placed inside {{if ...}} directly.
    // Split into preamble (template block) + condition variable.
    if (rendered.startsWith('{{')) {
      const lastOpen = rendered.lastIndexOf('{{')
      const lastClose = rendered.lastIndexOf('}}')
      if (lastOpen >= 0 && lastClose > lastOpen) {
        const preamble = rendered.substring(0, lastOpen)
        const condition = rendered.substring(lastOpen + 2, lastClose)
        return { condition, preamble }
      }
    }

    return { condition: rendered, preamble: '' }
  }

  /**
   * Render a ParsedExpr as a Go template condition.
   */
  private renderConditionExpr(expr: ParsedExpr): string {
    switch (expr.kind) {
      case 'identifier':
        return `.${this.capitalizeFieldName(expr.name)}`

      case 'literal':
        if (expr.literalType === 'string') {
          return `"${expr.value}"`
        }
        if (expr.literalType === 'null') {
          return '""'
        }
        return String(expr.value)

      case 'call': {
        // Signal call: count() -> .Count
        if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
          return `.${this.capitalizeFieldName(expr.callee.name)}`
        }
        return this.renderParsedExpr(expr)
      }

      case 'member': {
        // Handle .length with higher-order filter → len (bf_filter ...)
        if (expr.property === 'length' && expr.object.kind === 'higher-order') {
          const result = this.renderFilterLengthExpr(expr.object, e => this.renderConditionExpr(e))
          if (result) {
            return result
          }
        }

        // Handle SolidJS-style props pattern: props.xxx -> .Xxx
        if (expr.object.kind === 'identifier' && this.propsObjectName && expr.object.name === this.propsObjectName) {
          return `.${this.capitalizeFieldName(expr.property)}`
        }

        const obj = this.renderConditionExpr(expr.object)
        if (expr.property === 'length') {
          return `len ${obj}`
        }
        return `${obj}.${this.capitalizeFieldName(expr.property)}`
      }

      case 'binary': {
        // Check if left operand needs parentheses (e.g., function calls in Go template)
        const leftNeedsParens = this.needsParensInGoTemplate(expr.left)
        let left = this.renderConditionExpr(expr.left)
        if (leftNeedsParens) {
          left = `(${left})`
        }

        const rightNeedsParens = this.needsParensInGoTemplate(expr.right)
        let right = this.renderConditionExpr(expr.right)
        if (rightNeedsParens) {
          right = `(${right})`
        }

        switch (expr.op) {
          case '===':
          case '==':
            return `eq ${left} ${right}`
          case '!==':
          case '!=':
            return `ne ${left} ${right}`
          case '>':
            return `gt ${left} ${right}`
          case '<':
            return `lt ${left} ${right}`
          case '>=':
            return `ge ${left} ${right}`
          case '<=':
            return `le ${left} ${right}`
          // Arithmetic in conditions
          case '+':
            return `bf_add ${left} ${right}`
          case '-':
            return `bf_sub ${left} ${right}`
          case '*':
            return `bf_mul ${left} ${right}`
          case '/':
            return `bf_div ${left} ${right}`
          default:
            return `${left} ${expr.op} ${right}`
        }
      }

      case 'unary': {
        const arg = this.renderConditionExpr(expr.argument)
        if (expr.op === '!') {
          return `not ${arg}`
        }
        if (expr.op === '-') {
          return `bf_neg ${arg}`
        }
        return arg
      }

      case 'logical': {
        const left = this.renderConditionExpr(expr.left)
        const right = this.renderConditionExpr(expr.right)
        // Wrap in parentheses if needed
        const wrapLeft = this.needsParens(expr.left) ? `(${left})` : left
        const wrapRight = this.needsParens(expr.right) ? `(${right})` : right
        if (expr.op === '&&') {
          return `and ${wrapLeft} ${wrapRight}`
        }
        return `or ${wrapLeft} ${wrapRight}`
      }

      case 'conditional': {
        // Ternary in condition: (cond ? a : b) is unusual but handle it
        const test = this.renderConditionExpr(expr.test)
        return test // Just return the test part for condition context
      }

      case 'template-literal':
        // Template literals as conditions are unusual
        return this.renderParsedExpr(expr)

      case 'arrow-fn':
        // Arrow functions shouldn't appear in conditions
        return '[ARROW-FN]'

      case 'higher-order':
        // Higher-order methods in conditions need special handling
        return this.renderParsedExpr(expr)

      case 'unsupported':
        return expr.raw
    }
  }

  renderLoop(loop: IRLoop): string {
    // clientOnly loops: emit SSR markers so client can insert DOM nodes
    if (loop.clientOnly) {
      return `{{bfComment "loop"}}{{bfComment "/loop"}}`
    }

    let goArray = this.convertExpressionToGo(loop.array)
    const param = loop.param
    const index = loop.index || '_'

    // Check if the loop contains a component child
    // If so, use .{ComponentName}s which has ScopeID for each item
    // e.g., TodoItem children use .TodoItems, ToggleItem children use .ToggleItems
    const childComponent = this.findChildComponent(loop.children)
    if (childComponent) {
      goArray = `.${childComponent.name}s`
    }

    this.inLoop = true
    this.loopParamStack.push(param)
    const children = this.renderChildren(loop.children)
    this.loopParamStack.pop()
    this.inLoop = false

    // Apply sort if present: wrap array with bf_sort pipeline
    if (loop.sortComparator) {
      goArray = `(bf_sort ${goArray} "${loop.sortComparator.field}" "${loop.sortComparator.direction}")`
    }

    // Handle filter().map() pattern by adding if-condition
    if (loop.filterPredicate) {
      let filterCond: string

      if (loop.filterPredicate.blockBody) {
        // Block body: collect return paths and build OR condition
        filterCond = this.renderBlockBodyCondition(
          loop.filterPredicate.blockBody,
          loop.filterPredicate.param
        )
      } else if (loop.filterPredicate.predicate) {
        // Expression body: render predicate directly
        filterCond = this.renderPredicateCondition(
          loop.filterPredicate.predicate,
          loop.filterPredicate.param
        )
      } else {
        // Fallback: always true
        filterCond = 'true'
      }

      return `{{bfComment "loop"}}{{range $${index}, $${param} := ${goArray}}}{{if ${filterCond}}}${children}{{end}}{{end}}{{bfComment "/loop"}}`
    }

    return `{{bfComment "loop"}}{{range $${index}, $${param} := ${goArray}}}${children}{{end}}{{bfComment "/loop"}}`
  }

  /**
   * Find the first component child in a list of nodes
   */
  private findChildComponent(nodes: IRNode[]): IRComponent | null {
    for (const node of nodes) {
      if (node.type === 'component') {
        return node as IRComponent
      }
      // Check children of elements
      if (node.type === 'element' && (node as IRElement).children) {
        const found = this.findChildComponent((node as IRElement).children)
        if (found) return found
      }
      // Check children of fragments
      if (node.type === 'fragment' && (node as IRFragment).children) {
        const found = this.findChildComponent((node as IRFragment).children)
        if (found) return found
      }
    }
    return null
  }

  renderComponent(comp: IRComponent, ctx?: { isRootOfClientComponent?: boolean }): string {
    // Handle Portal component specially - collect content for body end
    if (comp.name === 'Portal') {
      return this.renderPortalComponent(comp)
    }

    // In Go templates, components are rendered using {{template "name" data}}
    let templateCall: string
    if (this.inLoop) {
      // Loop children: dot becomes loop item (already has correct props)
      templateCall = `{{template "${comp.name}" .}}`
    } else if (comp.slotId) {
      // Static children with slotId: use unique field name based on slotId
      const suffix = slotIdToFieldSuffix(comp.slotId)
      templateCall = `{{template "${comp.name}" .${comp.name}${suffix}}}`
    } else {
      // Static children without slotId: fallback to .ComponentName
      templateCall = `{{template "${comp.name}" .${comp.name}}}`
    }

    // Root component in client component needs scope comment for hydration boundary
    if (ctx?.isRootOfClientComponent) {
      return `{{bfScopeComment .}}${templateCall}`
    }
    return templateCall
  }

  /**
   * Render a Portal component by adding its children to PortalCollector.
   * Portal content is rendered at </body> instead of inline.
   *
   * For static content: uses simple string literal with Add()
   * For dynamic content: uses bfPortalHTML() to parse and execute template string
   */
  private renderPortalComponent(comp: IRComponent): string {
    // Render children content
    const children = this.renderChildren(comp.children)

    // Escape for Go double-quoted string literal
    const escapedContent = children
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')

    // Check if content has template expressions (dynamic content)
    if (children.includes('{{')) {
      // Content has dynamic parts - use bfPortalHTML to capture and render
      // bfPortalHTML parses and executes the template string with provided data
      return `{{.Portals.Add .ScopeID (bfPortalHTML . "${escapedContent}")}}`
    }

    // Static content - can use simple string literal
    return `{{.Portals.Add .ScopeID "${escapedContent}"}}`
  }

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      // Emit comment-based scope marker for fragment roots
      return `{{bfScopeComment .}}${children}`
    }
    return children
  }

  private renderSlot(slot: IRSlot): string {
    // Use Go template's block for slots
    const slotName = slot.name === 'default' ? 'children' : slot.name
    return `{{block "${slotName}" .}}{{end}}`
  }

  renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    // Go templates use the OOS protocol: render a placeholder with fallback,
    // the StreamRenderer resolves boundaries and streams replacement chunks.
    return `{{bfAsyncBoundary "${node.id}" "${this.escapeGoString(fallback)}"}}\n${children}`
  }

  private escapeGoString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  }

  private renderAttributes(element: IRElement): string {
    const parts: string[] = []

    for (const attr of element.attrs) {
      if (attr.name === '...') {
        // Spread attributes not directly supported in Go templates
        continue
      }

      // Convert JSX className to HTML class attribute
      const attrName = attr.name === 'className' ? 'class' : attr.name

      if (attr.value === null) {
        // Boolean attribute
        parts.push(attrName)
      } else if (typeof attr.value === 'object' && attr.value.type === 'template-literal') {
        // Template literal with structured ternaries
        const output = this.renderTemplateLiteral(attr.value)
        parts.push(`${attrName}="${output}"`)
      } else if (attr.dynamic) {
        const value = attr.value as string
        if (isBooleanAttr(attrName) || attr.presenceOrUndefined) {
          // Boolean attrs: render attr name only when truthy, omit when falsy
          const { condition: goCond, preamble } = this.convertConditionToGo(value)
          parts.push(`${preamble}{{if ${goCond}}}${attrName}{{end}}`)
        } else {
          // Check for ternary/conditional or template literal expressions using the parser
          const parsed = parseExpression(value.trim())
          if (parsed.kind === 'conditional' || parsed.kind === 'template-literal') {
            // These produce inline Go template syntax with embedded {{...}} actions
            const goValue = this.renderParsedExpr(parsed)
            parts.push(`${attrName}="${goValue}"`)
          } else {
            const goValue = this.convertExpressionToGo(value)
            parts.push(`${attrName}="{{${goValue}}}"`)
          }
        }
      } else {
        parts.push(`${attrName}="${attr.value}"`)
      }
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
  }

  private renderTemplateLiteral(literal: IRTemplateLiteral): string {
    let output = ''
    for (const part of literal.parts) {
      if (part.type === 'string') {
        output += part.value
      } else if (part.type === 'ternary') {
        const { condition: goCond, preamble } = this.convertConditionToGo(part.condition)
        output += `${preamble}{{if ${goCond}}}${part.whenTrue}{{else}}${part.whenFalse}{{end}}`
      }
    }
    return output
  }

  renderScopeMarker(_instanceIdExpr: string): string {
    // bfScopeAttr returns scopeID with ~ prefix for child components
    return `bf-s="{{bfScopeAttr .}}" {{bfPropsAttr .}}`
  }

  renderSlotMarker(slotId: string): string {
    return `bf="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `bf-c="${condId}"`
  }

  private wrapWithCondMarker(content: string, condId: string): string {
    // If content is a single HTML element, add bf-c attribute.
    // For fragments (multiple sibling elements), use comment markers.
    if (content.startsWith('<')) {
      const match = content.match(/^<(\w+)/)
      if (match) {
        const tag = match[1]
        const trimmed = content.trim()
        const isSingle = new RegExp(`</${tag}>\\s*$`).test(trimmed) || /^<\w+[^>]*\/>$/.test(trimmed)
        if (isSingle) {
          return content.replace(`<${match[1]}`, `<${match[1]} ${this.renderCondMarker(condId)}`)
        }
      }
    }
    // Text: use bfComment function to output comment markers
    // Go's html/template strips raw HTML comments, so we use a custom function
    // bfComment automatically adds "bf-" prefix, so "cond-start:x" becomes "<!--bf-cond-start:x-->"
    return `{{bfComment "cond-start:${condId}"}}${content}{{bfComment "cond-end:${condId}"}}`
  }
}

export const goTemplateAdapter = new GoTemplateAdapter()
