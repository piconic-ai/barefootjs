/**
 * The `generate()` the eight DSL template adapters (Blade, ERB, Jinja,
 * Mojolicious, Pebble, MiniJinja, Twig, Xslate) share (#3475), with the
 * per-compile state it sets up. Each adapter renders the nodes in its own
 * template language; how one compile begins and ends lives here once.
 */

import { augmentInheritedPropAccesses, collectModuleStringConsts } from '../augment-inherited-props.ts'
import { buildImportAliasMap } from '../ir-to-client-js/component-scope.ts'
import { prepareLoweringMatchers, type LoweringMatcher } from '../lowering-registry.ts'
import {
  collectNullableSignalGetters,
  collectNullishAttrContext,
  type NullishAttrContext,
} from '../nullable-signal-attr.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { rootPropAliasNames } from '../scope/root-prop-alias.ts'
import type { CompilerError, ComponentIR, IRIfStatement, IRMetadata } from '../types.ts'
import { collectImportedLoopChildComponentErrors } from './component-tree.ts'
import { computedConstContext, type ComputedConstContext } from './computed-const.ts'
import { searchParamsLocalNames } from './env-signal.ts'
import { BaseAdapter, type AdapterGenerateOptions, type AdapterOutput } from './interface.ts'
import { collectBooleanTypedProps, collectNullableOptionalProps } from './prop-classes.ts'
import { templateNameCollisionErrors } from './template-name-collisions.ts'

/**
 * How an adapter that renames reserved names spells a source identifier as
 * a template variable, and the engine name its collision diagnostic uses.
 */
export interface TemplateIdentifierSpelling {
  /** The adapter's mangling (`jinjaIdent`, `twigIdent`, …). */
  ident(name: string): string
  /** The engine name in the diagnostic ("Jinja", "MiniJinja", …). */
  label: string
}

export abstract class DslTemplateAdapter extends BaseAdapter {
  // ===========================================================================
  // Per-compile state, set at `generate()` entry
  // ===========================================================================

  protected componentName: string = ''
  /** Diagnostics collected while rendering, merged into `ir.errors` at the end. */
  protected errors: CompilerError[] = []
  /**
   * SolidJS-style props identifier (`function(props: P)`). The spread
   * emission builds a props-object bag from it without re-walking the IR.
   */
  protected propsObjectName: string | null = null
  /**
   * Name of the destructured `...rest` binding (`function X({ ...rest })`),
   * if any. A closed-type rest-expanded attribute's expression is
   * `${restPropsName}.${key}` (`expandSpreadAttribute`, #3057). Stripping
   * this prefix the same way `propsObjectName.` is stripped lets the
   * nullable-optional-props guard recognise it as a bare optional reference
   * instead of falling through to unconditional emission.
   */
  protected restPropsName: string | null = null
  protected propsParams: { name: string; optional: boolean }[] = []
  /** Props whose declared TS type is boolean (`collectBooleanTypedProps`). */
  protected booleanTypedProps: Set<string> = new Set()
  /** Names (signal getters + props) whose value is a string (`stringValueNamesFor`). */
  protected stringValueNames: Set<string> = new Set()
  /**
   * Module-scope pure-string consts (`const x = 'literal'`), keyed by name →
   * unescaped value. A className template literal that references such a
   * const (`className={`${x} ${className}`}`) must inline the literal: the
   * const is module-scope, so it never reaches the per-render context.
   */
  protected moduleStringConsts: Map<string, string> = new Map()
  /**
   * (#1922) Local binding names the request-scoped `searchParams()` env
   * signal is imported under (handles `import { searchParams as sp }`). When
   * non-empty the emitter lowers a `<binding>().get(k)` call to a real method
   * call on the per-request `searchParams` reader instead of the generic
   * deref. Read by the top-level ParsedExpr emitter.
   */
  protected _searchParamsLocals: Set<string> = new Set()
  /**
   * Call-lowering matchers active for this component (#2057), read by the
   * top-level emitter. Covers both userland plugins and the compiler's
   * built-in plugins (e.g. `queryHref`, #2042): one uniform path, no per-API
   * branch.
   */
  protected _loweringMatchers: LoweringMatcher[] = []
  /** The component's computed consts, inlined where a template reads them (#3494). */
  protected computedConsts: ComputedConstContext | null = null
  /**
   * Local + module constants from the IR, used by the conditional-spread and
   * `Record<staticKeys, scalar>[propKey]` lowering paths (#textarea /
   * #checkbox): the spread emission resolves a bare local const
   * (`const sizeAttrs = size ? {…} : {}`) to its initializer text.
   */
  protected localConstants: IRMetadata['localConstants'] = []
  /** Each prop's collision-free root alias (#3314), decided once per component. */
  protected rootPropAliases: ReadonlyMap<string, string> = new Map()
  /**
   * The one canonical, position-accurate "names bound by an enclosing loop
   * callback" service (#2482 Stage 2). Every shadow-guard site reads this
   * one threaded, immutable scope: `renderLoop` enters the row with
   * `enterLoopRow` around the loop's children and restores the outer scope
   * by reference afterwards, mirroring `ctx.scope` in `jsx-to-ir.ts`.
   * `IRLoop` structurally satisfies `LoopBindingSource`, so `renderLoop`
   * passes the loop node straight to `enterLoopRow`.
   */
  protected scope: BindingScope = BindingScope.EMPTY
  /**
   * Optional, no-default props that are absent when the caller omits them
   * (`collectNullableOptionalProps`). A bare-reference attribute of one is
   * guarded with the template's presence test, so the attribute drops rather
   * than rendering `attr=""` (Hono-style nullish omission, e.g. textarea's
   * `rows`).
   */
  protected nullableOptionalProps: Set<string> = new Set()
  /** Getters of nullable signals (`collectNullableSignalGetters`, #3304). */
  protected nullableSignalGetters: Set<string> = new Set()
  /** Signals and memos `attrValueMayBeNullish` reads (#3322). */
  protected nullishAttrCtx: NullishAttrContext = { nullableSignals: new Set(), memos: new Map() }
  /**
   * Local alias -> declared/exported name for imported components (#2822,
   * the SSR-side counterpart of #2777's client-JS registry-key fix). A child
   * referenced under an import alias (`import { Foo as Bar }`, `<Bar/>`)
   * must build its cross-template call against the child's own declared
   * name (`Foo`, what `foo.tsx` registers its template as), never the
   * caller-local binding. Read by `childTemplateName`.
   */
  protected importAliases: Map<string, string> = new Map()
  /** Numbers the children captures of a child component that has no slot id. */
  protected childrenCaptureCounter = 0

  // ===========================================================================
  // What each adapter supplies
  // ===========================================================================

  /** The adapter's name in the BF103 imported-loop-child diagnostic ("The Jinja adapter emits …"). */
  protected abstract readonly loopChildDiagnosticName: string
  /**
   * For an adapter that renames reserved names: two source names the
   * renaming turns into one template variable would read the same value, so
   * `generate()` refuses them (#3404). `null` when the adapter renames none.
   */
  protected readonly templateIdentifierSpelling: TemplateIdentifierSpelling | null = null
  /** The names whose value is a string, for `stringValueNames`. */
  protected abstract stringValueNamesFor(ir: ComponentIR): Set<string>
  /**
   * Sets the adapter's own per-compile state. Runs after the shared state
   * above and before any diagnostic or rendering.
   */
  protected resetAdapterState(_ir: ComponentIR): void {}
  /** The root `if` statement of a component with conditional returns. */
  protected abstract renderIfStatement(ifStmt: IRIfStatement): string
  /** The script registrations the template starts with. */
  protected abstract generateScriptRegistrations(
    ir: ComponentIR,
    scriptBaseName?: string,
    scriptAssets?: string[],
    preloadAssets?: string[],
  ): string
  /**
   * SSR context consumers (`const x = useContext(Ctx)`): seeds each local
   * from the active provider value, or the `createContext` default. The
   * provider side pushes the value via `emitProvider` (#1297).
   */
  protected abstract contextConsumerSeed(ir: ComponentIR): string
  /**
   * Prop/signal-derived memos with a `null` static SSR default (e.g.
   * `createMemo(() => props.value * 10)`), computed in-template from the
   * already-seeded prop/signal vars, mirroring Go's generated child
   * constructor (#1297).
   */
  protected abstract derivedMemoSeed(ir: ComponentIR): string

  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput {
    this.resetCompileState(ir)
    this.collectCompileErrors(ir, options)

    const templateBody = ir.root.type === 'if-statement'
      ? this.renderIfStatement(ir.root as IRIfStatement)
      : this.renderNode(ir.root)
    const scriptReg = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName, options?.scriptAssets, options?.preloadAssets)
    const ctxSeed = this.contextConsumerSeed(ir)
    const memoSeed = this.derivedMemoSeed(ir)
    const template = `${scriptReg}${ctxSeed}${memoSeed}${templateBody}\n`

    if (this.errors.length > 0) {
      ir.errors.push(...this.errors)
    }

    // A DSL template has no JS-style imports / types / default-export
    // sections. The `templatesPerComponent` mode emits one file per
    // component using the raw `template` value; sections are populated for
    // contract uniformity so the compiler never has to string-parse the
    // template.
    return {
      template,
      sections: { imports: '', types: '', component: template, defaultExport: '' },
      extension: this.extension,
    }
  }

  private resetCompileState(ir: ComponentIR): void {
    this.componentName = ir.metadata.componentName
    this.propsObjectName = ir.metadata.propsObjectName ?? null
    this.restPropsName = ir.metadata.restPropsName ?? null
    // (#checkbox) Enumerate the props-object pattern's inherited attribute
    // accesses (`props.className`/`id`/`disabled`) into propsParams, before
    // deriving `nullableOptionalProps` below, so a bare optional attribute
    // like `id={props.id}` gets the template's presence guard. This mutates
    // the IR: a harness that serialized it before `generate` doesn't see it.
    augmentInheritedPropAccesses(ir)
    this.propsParams = ir.metadata.propsParams.map(p => ({ name: p.name, optional: p.optional }))
    this.booleanTypedProps = collectBooleanTypedProps(ir)
    this.localConstants = ir.metadata.localConstants ?? []
    this.rootPropAliases = rootPropAliasNames(ir, this.propsParams.map(p => p.name))
    this.scope = BindingScope.EMPTY
    this.nullableOptionalProps = collectNullableOptionalProps(ir)
    this.nullableSignalGetters = collectNullableSignalGetters(ir)
    this.nullishAttrCtx = collectNullishAttrContext(ir)
    this.stringValueNames = this.stringValueNamesFor(ir)
    this.moduleStringConsts = collectModuleStringConsts(ir.metadata.localConstants)
    this._searchParamsLocals = searchParamsLocalNames(ir.metadata)
    this._loweringMatchers = prepareLoweringMatchers(ir.metadata)
    this.computedConsts = computedConstContext(ir.metadata, name => this.scope.isBound(name))
    this.importAliases = buildImportAliasMap(ir.metadata.imports ?? [])
    this.childrenCaptureCounter = 0
    this.errors = []
    this.resetAdapterState(ir)
  }

  private collectCompileErrors(ir: ComponentIR, options?: AdapterGenerateOptions): void {
    const spelling = this.templateIdentifierSpelling
    if (spelling) {
      const propNames = this.propsParams.map(p => p.name)
      this.errors.push(...templateNameCollisionErrors(ir, propNames, spelling.ident, spelling.label, this.componentName))
    }
    // A child component referenced inside a loop body that is imported from
    // a sibling .tsx renders as a cross-template call, which resolves only if
    // the sibling template is registered alongside the parent at render
    // time. Surface it loudly here, unless the caller (e.g. the barefoot
    // CLI) guarantees that every sibling template is registered on the same
    // template instance.
    if (!options?.siblingTemplatesRegistered) {
      this.errors.push(...collectImportedLoopChildComponentErrors(ir, this.componentName, this.loopChildDiagnosticName))
    }
  }
}
