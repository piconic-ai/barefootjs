/**
 * Per-compile mutable state for the Go html/template adapter. The adapter is a
 * reused singleton; everything established (and reset) per `generate()` /
 * `generateTypes()` run lives here. The adapter holds a single `CompileState`
 * and resets its members at the start of each compile.
 *
 * NOT included (deliberately): cross-compile child-shape registries
 * (`childComponentShapes`, `childContextConsumers`, populated before a parent
 * compiles), the render-recursion cursor stacks (`loopParamStack`,
 * `filterExprDepth`, …), and constant config (`options`, `templatePrimitives`).
 */

import type {
  CompilerError,
  ContextConsumer,
  IRMetadata,
  IRNode,
  MemoInfo,
  TypeDefinition,
  TypeInfo,
} from '@barefootjs/jsx'

export class CompileState {
  // --- Reset at the start of `generate()` -----------------------------------

  componentName: string = ''
  errors: CompilerError[] = []

  /** Component-scope derived consts referenced by the template during rendering
   *  (e.g. `root` → `.Root`). `generateTypes` emits a computed field for each
   *  that's resolvable and non-colliding. */
  referencedDerivedConsts: Set<string> = new Set()

  templateVarCounter: number = 0

  /**
   * Companion `{{define "<Component>__children_<slot>"}}` blocks queued while
   * rendering the template body. Flushed after the main define in `generate()`.
   */
  pendingChildrenDefines: Array<{ name: string; content: string }> = []

  propsObjectName: string | null = null

  /**
   * Component-scoped rest binding identifier (`function({ a, ...rest }: P)`
   * → `'rest'`). Stashed at `generate()` entry so per-attribute emitter
   * callbacks can classify a spread expression against it.
   */
  restPropsName: string | null = null

  /**
   * Module-scope pure string-literal constants (`const X = 'literal'` at
   * file top-level), keyed by name → resolved literal value. When an identifier
   * resolves to one of these, the adapter inlines the literal value instead of
   * emitting a struct-field reference.
   */
  moduleStringConsts: Map<string, string> = new Map()

  /**
   * All local constants (module + function-scope) from the IR, retained for
   * the lifetime of `generate()` so the memo-computation path can resolve
   * `Record`-index lookups without re-threading the full `ir` through helpers.
   */
  localConstants: IRMetadata['localConstants'] = []

  /**
   * Names of component-scope arrow-const helpers (`const sortClass = …`),
   * eligible for call-site inlining.
   */
  localHelperNames: Set<string> = new Set()

  /** The current IR's memos, stashed like `localConstants` so nested memo
   *  resolution can recurse without threading the list through every signature.
   *  Full `MemoInfo` so consumers can read the analyzer-attached `parsed` tree. */
  currentMemos: MemoInfo[] = []

  /** Full type definitions from the current IR, stashed for loop-datum field resolution. */
  currentTypeDefinitions: TypeDefinition[] = []

  /**
   * `useContext(...)` consumers in the component being generated. Each becomes
   * a struct field defaulted to the `createContext` default.
   */
  contextConsumers: ContextConsumer[] = []

  /**
   * Local binding names the request-scoped `searchParams()` env signal is
   * imported under (handles `import { searchParams as sp }`).
   */
  searchParamsLocals: Set<string> = new Set()

  /**
   * Prop NAMES whose resolved Go struct-field type is exactly `interface{}`
   * — i.e. nillable. Used by the attribute emitter to omit a dynamic attribute
   * whose value is a bare reference to such a prop when it's nil.
   */
  nillablePropNames: Set<string> = new Set()

  /** Component root scope element(s) — each carries `data-key` for a keyed loop
   *  item. */
  rootScopeNodes: Set<IRNode> = new Set()

  /** Array-memo name → the handler-filled loop slice field its `.map()` feeds
   *  (e.g. `visible` → `PostListItems`). Lets `<memo>().length` lower to the
   *  slice's length instead of a nil/unset memo field. */
  memoBackedLoopSlice: Map<string, string> = new Map()

  // --- Reset at the start of `generateTypes()` ------------------------------

  /** Set during type generation when any emit references
   *  `template.HTML(...)`; toggles the `"html/template"` import. */
  usesHtmlTemplate: boolean = false

  /** Set during type generation when any emit references `fmt.Sprint(...)`;
   *  toggles the `"fmt"` import. */
  usesFmt: boolean = false

  /** Local type names resolved from typeDefinitions (populated during generateTypes). */
  localTypeNames: Set<string> = new Set()

  /** Local type aliases mapping type name to base type (e.g., Filter → 'string'). */
  localTypeAliases: Map<string, string> = new Map()

  /**
   * Per-struct field map (type name → source TS key → Go field name), populated
   * during generateTypes. The object-literal baker consults this so a baked
   * struct literal only names fields the generated struct actually declares.
   */
  localStructFields: Map<string, Map<string, string>> = new Map()

  /**
   * Synthesised array types for untyped object-array signals (signal getter →
   * `[]SynthStruct` TypeInfo), populated during generateTypes.
   */
  synthStructTypes: Map<string, TypeInfo> = new Map()

  /** Set when a constructor-context lowering emits a `strings.` call, so
   *  `strings` is added to the generated types file's import block. */
  needsStringsImport = false
}
