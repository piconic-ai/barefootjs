/**
 * IR component-tree analysis for the Go html/template adapter.
 *
 * Pure structural walks over the IR — no adapter instance state, no rendering.
 * Extracted from `go-template-adapter.ts` (Phase 4 decomposition). Only the two
 * entry points (`hasClientInteractivity`, `findNestedComponents`) are exported;
 * the recursive collectors stay module-internal.
 */

import type {
  ComponentIR,
  IRNode,
  IRElement,
  IRFragment,
  IRConditional,
  IRLoop,
  IRIfStatement,
  IRComponent,
} from '@barefootjs/jsx'

import type { NestedComponentInfo } from '../lib/types.ts'

/**
 * Does the component need client JS? True when it has reactive state
 * (signals), effects, onMounts, any event handler in the tree, or any
 * child component (which needs the parent's hydration).
 */
export function hasClientInteractivity(ir: ComponentIR): boolean {
  if (ir.metadata.signals.length > 0) return true
  if (ir.metadata.effects.length > 0) return true
  if (ir.metadata.onMounts.length > 0) return true
  if (hasEventsInTree(ir.root)) return true
  // Child components need the parent's hydration.
  if (findChildComponentNames(ir.root).size > 0) return true
  return false
}

/** Recursively check if any element in the tree has events. */
function hasEventsInTree(node: IRNode): boolean {
  if (node.type === 'element') {
    const element = node as IRElement
    if (element.events.length > 0) return true
    for (const child of element.children) {
      if (hasEventsInTree(child)) return true
    }
  } else if (node.type === 'fragment') {
    const fragment = node as IRFragment
    for (const child of fragment.children) {
      if (hasEventsInTree(child)) return true
    }
  } else if (node.type === 'conditional') {
    const cond = node as IRConditional
    if (hasEventsInTree(cond.whenTrue)) return true
    if (cond.whenFalse && hasEventsInTree(cond.whenFalse)) return true
  } else if (node.type === 'loop') {
    const loop = node as IRLoop
    for (const child of loop.children) {
      if (hasEventsInTree(child)) return true
    }
  } else if (node.type === 'if-statement') {
    const ifStmt = node as IRIfStatement
    if (hasEventsInTree(ifStmt.consequent)) return true
    if (ifStmt.alternate && hasEventsInTree(ifStmt.alternate)) return true
  }
  return false
}

/** Find all child component names used in the IR tree. */
function findChildComponentNames(node: IRNode): Set<string> {
  const names = new Set<string>()
  collectChildComponentNames(node, names)
  return names
}

function collectChildComponentNames(node: IRNode, names: Set<string>): void {
  if (node.type === 'component') {
    const comp = node as IRComponent
    names.add(comp.name)
  } else if (node.type === 'element') {
    const element = node as IRElement
    for (const child of element.children) {
      collectChildComponentNames(child, names)
    }
  } else if (node.type === 'fragment') {
    const fragment = node as IRFragment
    for (const child of fragment.children) {
      collectChildComponentNames(child, names)
    }
  } else if (node.type === 'conditional') {
    const cond = node as IRConditional
    collectChildComponentNames(cond.whenTrue, names)
    if (cond.whenFalse) {
      collectChildComponentNames(cond.whenFalse, names)
    }
  } else if (node.type === 'loop') {
    const loop = node as IRLoop
    for (const child of loop.children) {
      collectChildComponentNames(child, names)
    }
  } else if (node.type === 'if-statement') {
    const ifStmt = node as IRIfStatement
    collectChildComponentNames(ifStmt.consequent, names)
    if (ifStmt.alternate) {
      collectChildComponentNames(ifStmt.alternate, names)
    }
  }
}

/**
 * Find all nested components (loops with `childComponent`). Returns extended
 * info that includes whether the component comes from a dynamic (signal) array
 * loop vs a static one.
 */
export function findNestedComponents(node: IRNode): NestedComponentInfo[] {
  const result: NestedComponentInfo[] = []
  collectNestedComponents(node, result)
  return result
}

function collectNestedComponents(node: IRNode, result: NestedComponentInfo[]): void {
  if (node.type === 'loop') {
    const loop = node as IRLoop
    if (loop.childComponent) {
      // Check for duplicates
      if (!result.some(c => c.name === loop.childComponent!.name)) {
        const hasBodyChildren = loop.childComponent.children.length > 0
        result.push({
          ...loop.childComponent,
          isDynamic: !loop.isStaticArray,
          isPropDerived: !!loop.isPropDerivedArray,
          loopKey: loop.key ?? undefined,
          loopParam: loop.param ?? undefined,
          bodyChildren: hasBodyChildren ? loop.childComponent.children : undefined,
          loopArray: loop.array,
          loopArrayParsed: loop.arrayParsed,
          loopMarkerId: loop.markerId,
          loopItemType: loop.itemType,
        })
      }
    }
    for (const child of loop.children) {
      collectNestedComponents(child, result)
    }
  } else if (node.type === 'element') {
    const element = node as IRElement
    for (const child of element.children) {
      collectNestedComponents(child, result)
    }
  } else if (node.type === 'fragment') {
    const fragment = node as IRFragment
    for (const child of fragment.children) {
      collectNestedComponents(child, result)
    }
  } else if (node.type === 'conditional') {
    const cond = node as IRConditional
    collectNestedComponents(cond.whenTrue, result)
    if (cond.whenFalse) {
      collectNestedComponents(cond.whenFalse, result)
    }
  } else if (node.type === 'if-statement') {
    const stmt = node as IRIfStatement
    collectNestedComponents(stmt.consequent, result)
    if (stmt.alternate) {
      collectNestedComponents(stmt.alternate, result)
    }
  } else if (node.type === 'component') {
    // (#1896) JSX children passed to an imported component render via
    // a companion define with the PARENT's data, so a keyed loop
    // nested inside them (DataTablePreviewDemo's `sortedData().map(…)`
    // inside `<TableBody>`) needs its `<Name>s` slice on THIS
    // component's props like any other nested loop.
    const comp = node as IRComponent
    for (const child of comp.children) {
      collectNestedComponents(child, result)
    }
  }
}
