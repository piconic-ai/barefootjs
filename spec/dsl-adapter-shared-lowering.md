# DSL Adapters: a Shared Lowering Layer

Design note for #3426. It answers one question: which of the functions that the
eight DSL template adapters (Blade, Twig, ERB, Jinja, MiniJinja/Rust,
Mojolicious, Xslate, Pebble) all carry are the *same decision* spelled eight
times, and which are genuinely per-backend. Nothing here is implemented; the
follow-up issues at the end are the work.

> Status: **investigation, complete.** Measured at the tree this note landed
> in, with [cccc](https://github.com/moznion/cccc) v1.8.0 (`bun run complexity`)
> and a one-off line-similarity script described below. Re-measure before
> acting on the numbers.

## Why

Every DSL adapter is moderate on its own (620–690 cognitive per main class),
but a fix to one decision has to be made in several of them at once. Since
2026-09-20, 46 commits touched a DSL adapter's `src/`; 18 of them touched three
or more adapters, and the fixes for #3350, #3380, #3390, #3402 and #3404 each
took between four and eight adapters. The cost is not the complexity of any
one copy; it is that a semantic decision is re-implemented, re-reviewed and
re-fixed per backend, and a sibling backend is easy to miss (#3332's `?.length`
was fixed on eight backends and stayed open on Go in #3422; #3350's nullish
operand coercion landed on four adapters, see below).

## Method

1. **Name overlap.** `cccc` over `packages/adapter-*/src/adapter` (the eight
   DSL adapters), grouping top-level functions and class methods by name.
   105 of 278 distinct names appear in at least six adapters, and those
   functions carry 3,877 of the 5,276 cognitive points (73%).
2. **Implementation similarity.** For each of those names, the body of every
   copy was normalized (comments and blank lines dropped, lines trimmed) and
   compared pairwise with a Jaccard line-set similarity. "Lines in all" counts
   the lines present verbatim in every copy. The table below is sorted by
   average body length.
3. **Reading the diffs.** For the large or low-similarity functions, the Jinja
   copy was diffed against the ERB, Mojolicious, Blade and Pebble copies and
   each difference classified as *syntax* (how the backend spells a construct:
   a filter, an escape, a loop header, a local binding) or *semantic* (a
   decision about what to render: which names a row binds, when an attribute
   is omitted, which fallback chain a callback takes, what a diagnostic says).

Terms: a **semantic decision** must be identical across backends for the
fixtures to agree with the Hono reference; a **syntax hook** is the per-backend
spelling of a construct the shared layer has already decided on.

## Evidence

| function | adapters | lines (avg) | lines in all | mean sim | min sim |
| --- | --- | --- | --- | --- | --- |
| renderLoop | 8 | 161 | 35 | 0.37 | 0.16 |
| renderArrayMethod | 8 | 132 | 61 | 0.71 | 0.56 |
| elementAttrEmitter | 8 | 110 | 43 | 0.47 | 0.33 |
| collectImportedLoopChildComponentErrors | 8 | 72 | 54 | 0.93 | 0.93 |
| callbackMethod | 8 | 62 | 25 | 0.66 | 0.41 |
| generate | 8 | 50 | 42 | 0.88 | 0.82 |
| renderComponent | 8 | 44 | 15 | 0.45 | 0.27 |
| renderElement | 8 | 42 | 32 | 0.90 | 0.89 |
| call | 8 | 39 | 19 | 0.61 | 0.58 |
| renderConditional | 8 | 31 | 19 | 0.58 | 0.47 |
| generateScriptRegistrations | 8 | 25 | 11 | 0.55 | 0.33 |
| _emitPredicateCallback | 6 | 24 | 13 | 0.73 | 0.36 |
| renderReduceEval | 8 | 23 | 13 | 0.65 | 0.41 |
| refuseUnsupportedAttrExpression | 8 | 22 | 21 | 0.92 | 0.91 |
| isBooleanResultParsed | 6 | 21 | 17 | 0.96 | 0.89 |
| componentPropEmitter | 8 | 21 | 9 | 0.33 | 0.31 |
| generateDerivedMemoSeed | 8 | 18 | 6 | 0.41 | 0.25 |
| collectStringValueNames | 8 | 18 | 9 | 0.75 | 0.53 |
| renderDangerousInnerHtml | 8 | 18 | 13 | 0.87 | 0.87 |
| renderIfStatement | 8 | 18 | 11 | 0.59 | 0.52 |
| parsePureStringLiteral | 6 | 17 | 13 | 1.00 | 1.00 |
| templateLiteral | 8 | 17 | 6 | 0.53 | 0.30 |
| parseUndefinedAlternateTernary | 8 | 17 | 16 | 1.00 | 1.00 |
| renderExpression | 8 | 15 | 6 | 0.42 | 0.33 |
| combineComponentPropSegments | 6 | 15 | 5 | 0.48 | 0.24 |
| binary | 8 | 14 | 3 | 0.36 | 0.14 |
| renderPredicateEval | 8 | 14 | 12 | 0.82 | 0.75 |
| member | 8 | 13 | 6 | 0.58 | 0.33 |
| renderSortEval | 8 | 13 | 11 | 0.80 | 0.73 |
| collectNullableOptionalProps | 8 | 13 | 13 | 1.00 | 1.00 |
| _recordExprBF101 | 8 | 13 | 10 | 0.84 | 0.59 |
| generateContextConsumerSeed | 8 | 12 | 10 | 0.83 | 0.83 |
| emitEvalEnvArg | 8 | 12 | 9 | 0.73 | 0.60 |
| tryLowerStyleObject | 8 | 12 | 6 | 0.53 | 0.32 |
| renderAttributes | 8 | 12 | 11 | 1.00 | 1.00 |
| unescapeStringLiteralBody | 6 | 11 | 10 | 1.00 | 1.00 |
| objectLiteral | 8 | 11 | 1 | 0.39 | 0.07 |
| renderFlatMapEval | 8 | 11 | 10 | 0.83 | 0.83 |
| renderMapEval | 8 | 11 | 10 | 0.83 | 0.83 |
| renderFlatMethod | 8 | 11 | 8 | 0.79 | 0.67 |
| renderSortMethod | 8 | 10 | 5 | 0.51 | 0.33 |
| conditional | 8 | 9 | 7 | 0.73 | 0.64 |
| componentPropSegmentEntries | 6 | 9 | 9 | 1.00 | 1.00 |
| isBooleanTypedPropRef | 8 | 9 | 7 | 0.94 | 0.78 |
| hasClientInteractivity | 8 | 8 | 8 | 1.00 | 1.00 |
| identifier | 8 | 8 | 4 | 0.51 | 0.31 |
| arrayMethod | 8 | 8 | 8 | 1.00 | 1.00 |
| logical | 8 | 7 | 4 | 0.48 | 0.40 |
| flatMethod | 8 | 7 | 7 | 1.00 | 1.00 |
| collectBooleanTypedProps | 8 | 7 | 7 | 1.00 | 1.00 |
| literal | 8 | 6 | 3 | 0.47 | 0.33 |
| isLiteralIndex | 8 | 6 | 6 | 1.00 | 1.00 |

Three-line dispatcher methods (`emitElement`, `emitLoop`, …) and per-instance
fields are omitted; they differ only in the class name.

A similarity of 1.00 is a verbatim copy. A low similarity with many "lines in
all" (e.g. `renderLoop`: 35 identical lines but 0.16 at worst) is the signature
of one decision tree with eight spellings — the structure matches, the leaves
do not.

## Classification

### Verbatim copies — share now, no design needed

Identical or near-identical in every adapter (similarity ≥ 0.9). Moving them to
`@barefootjs/jsx`'s `adapters/` directory (next to `filter-capture-collisions.ts`,
`loop-bound-names.ts` and the other helpers the adapters already import) is a
pure dedupe:

`parseUndefinedAlternateTernary`, `renderAttributes`, `collectNullableOptionalProps`,
`collectBooleanTypedProps`, `hasClientInteractivity`, `arrayMethod`, `flatMethod`,
`isLiteralIndex`, `renderNodeOrNull`, `renderFragment`, `toTemplateName`,
`componentPropSegmentEntries`, `parsePureStringLiteral`, `unescapeStringLiteralBody`,
`containsUnescaped`, `isBooleanResultParsed`, `isBooleanTypedPropRef`,
`collectImportedLoopChildComponentErrors` (0.93: the diagnostic names the adapter),
`refuseUnsupportedAttrExpression` (0.92: same), `renderElement` (0.90),
`renderDangerousInnerHtml` (0.87), `generate` (0.88), `generateContextConsumerSeed`
(0.83).

Where the only difference is the adapter's display name in a diagnostic or the
runtime helper's spelling, the shared function takes it as a parameter.

The four evaluator emitters (`renderPredicateEval` / `renderSortEval` /
`renderMapEval` / `renderFlatMapEval`, 0.80–0.83) look like members of this
list but are not. The eligibility test (`serializeParsedExpr` refusing what the
evaluator cannot run), the captured free variables and the `forward` flag are
shared decisions; what each copy renders around them is backend syntax. Jinja
emits `true` / `false`, `bf.find_eval(…)`, `escapeJinjaSingleQuoted` and a
`{key: value}` environment; Mojolicious emits `1` / `0`, `bf->find_eval(…)`,
`escapePerlSingleQuote` and `{ 'key' => value }`. They belong to the
callback-method chain in the next section, with the boolean literal, the
string escape, the environment literal and the invocation spelling as hooks.

### One decision, eight spellings — the shared layer

These carry the semantic decisions that the recent multi-adapter fixes
touched. Each is listed with what is semantic (to share) and what is syntax (to
leave as a hook).

**`renderLoop`** (161 lines, 563 cognitive across the eight, the largest
function in every adapter). Semantic, identical in intent in every copy:

- the `clientOnly` marker pair;
- the destructure lowerability gate (`isLowerableLoopDestructure`, BF104);
- static-source resolution (`resolveStaticLoopSource`, already shared) and the
  refusal of an unresolvable local const (BF101) — **the predicates differ**:
  Jinja/Pebble/Twig/Blade/Mojolicious/Xslate test the array text with a regex
  and `resolveLiteralConst`; ERB reads `loop.arrayParsed`, consults
  `scope.isBound` and `resolveModuleStringConst` too. Same intent, two
  implementations, the defect family AGENTS.md's "Reference Adapter" section
  names;
- the sort chain: evaluator first (`renderSortEval`), structured `bf.sort`
  second, then raw or BF101 — Jinja falls back to the raw array silently,
  ERB/Mojolicious raise BF101 (a semantic divergence);
- which names the row binds: item, index (or key for `keys`/`entries`), the
  destructure bindings (`paramBindings` → accessor paths, `bf.slice`, `bf.omit`),
  the preamble declarations, and the row `BindingScope` window
  (`enterLoopRow`) that the key anchor and the preamble initializers must see;
- the filter-capture aliases (`filterCaptureCollisions`, `renameFreeIdentifiers`,
  already shared) and the root-prop aliases (`rootPropAliasesForLoop`, shared);
- the whole-item-conditional key anchor (`loop-i:` + `escape_comment_key`).

Syntax: the comment spelling (`{{ … | safe }}`, `| raw`, `<%= %>`, `<%== %>`);
the loop header (`{% for %}`, `.each_with_index do |…|`, `for my $i (0..$#…)`);
how a local is bound (`{% set %}`, a block parameter, `my $x`); where the index
comes from (`loop.index0`, `loop.index`, a block parameter, a counter); object
iteration (`.items()`, `each_pair`, `sort keys %{…}`, `bf.entries`); and the
Pebble/Twig/Blade save-and-restore of names a `{% set %}` would clobber past
the loop (#3386, #3391) — a backend capability (`set` is not loop-scoped) that
the shared layer should express as "these names need restoring" and the hook
spells.

**`callbackMethod`** (62 lines). Semantic: the eval-first → structured →
BF101 chain for `sort`/`toSorted`, `reduce`/`reduceRight`, `flatMap`, `map`
and the predicate family. The order of the checks differs between copies
(Jinja tests predicates first, ERB last) without changing the outcome, and
the BF101 messages differ in wording. Syntax: the evaluator call that
`renderSortEval` & co. render — the boolean literal, the string escape, the
environment literal and the invocation spelling (`bf.` vs `bf->`).

**`renderArrayMethod`** (132 lines, 61 identical). Semantic: the catalogue
(`join`, `includes`, `indexOf`, `at`, `concat`, `slice`, `reverse`, `trim`,
`toFixed`, `split`, `startsWith`, `replace`, `replaceAll`, `repeat`,
`padStart`, …) and each method's arity defaults (`join` → `','`, `at` → `0`,
`slice` end → "to length"). Syntax: the runtime helper's spelling (`bf.lc` vs
`.downcase`, `bf.slice(…, none)` vs `nil`). This is a table — method →
helper id + default arguments — and the adapter supplies the helper name per
id, the same shape the `LoweringPlugin` registry already uses for built-ins.

**`elementAttrEmitter`** (110 lines, 43 identical). Semantic: the attribute
plan — omit when nullable (`is defined and is not none` / `.nil?`), presence
check through a temporary (`bf_pu<N>`), `bf.bool_str` for boolean-typed
props, the conditional attribute (`cond ? name : ''`), the template-literal
attribute, the spread-attrs shape including the `props` object and the
ternary dict. Syntax: the escape call (`bf.string`, `bf.h`), the nil test,
the truthy test, the local binding, the hash key spelling.

**`binary` / `unary` / `logical` / `member` / `identifier` / `templateLiteral`
/ `literal` / `call` / `conditional` / `objectLiteral`** (the
`ParsedExprEmitter` methods). Mostly syntax, with four semantic decisions
hidden inside:

- nullish operand coercion in arithmetic (#3350): `coerceNullishOperand`
  exists in ERB, Jinja, MiniJinja and Pebble, not in Blade, Twig, Mojolicious
  or Xslate (the PHP and Perl runtimes may absorb it; **to verify**, this is
  how a sibling backend gets missed);
- operand grouping and division (`groupBinaryOperand` in seven adapters,
  `bf.div` in ERB only) and the JS number notation at the 1e-6 / 1e21
  boundaries (#3380, six adapters);
- const inlining (`resolveModuleStringConst`, `resolveLiteralConst`,
  `resolveStaticRecordLiteral` — the lookups are shared, the call order is
  not);
- the root-prop read (`rootPropReadName`, shared) and the loop-bound-name
  rewrite (`isLoopBoundName` → `rubyLocal` in ERB only).

Syntax: null spelling (`none`, `nil`, `null`, `undef`), string literal
escaping, member access (`['k']`, `[:k]`, `->{k}`), concatenation (`~`, `+`,
`.`), identifier mangling.

**`renderComponent` / `componentPropEmitter` / `combineComponentPropSegments`**
(44 + 21 + 15 lines). Semantic: prop assembly — named-slot captures,
`children` capture, `_bf_slot`, and the spread segments
(`{ kind: 'entries' | 'spread' }`) that Blade/Jinja/Pebble/Rust/Twig/Xslate
carry and ERB/Mojolicious do not (they build a flat `propParts` list;
**whether a spread onto a component renders the same on those two is to
verify**). Syntax: the capture mechanism (`{% set %}…{% endset %}`,
`_erbout.slice!`, `begin … end`), the hash literal.

**`renderConditional` / `renderIfStatement`** (31 + 18 lines). Semantic: the
`cond` marker placement (`addCondMarkerToFirstElement`, 0.73), the
client-only conditional, the `undefined`-alternate ternary. Syntax:
`{% if %}` / `<% if %>` / `% if (…) {`.

**`generateScriptRegistrations` / `generateDerivedMemoSeed` /
`collectStringValueNames` / `tryLowerStyleObject`**: the same decision with
a syntax tail (the memo seed's expression spelling, the style object's
`key: value` join). Shareable after the expression emitters above are.

### Backend-specific — stays per adapter

- The `lib/<backend>-naming.ts` modules (identifier mangling, reserved words,
  hash-key and string-literal spelling, `accessorFromSegments`).
- `lib/static-value.ts` (`staticValueToJinja` / `…ToRuby` / `…ToPerl`): the
  literal spelling of a static array source.
- The filter emitters (`JinjaFilterEmitter`, `renderJinjaFilterExpr`, …): the
  predicate's own emitter, where the DSL's expression grammar diverges most.
- `emit-context.ts` and `lib/types.ts`: each adapter's seam and per-compile
  state.
- The runtime helpers themselves (`bf.*` in Python, Ruby, Perl, PHP, Java,
  Rust) — specified once in `spec/template-helpers.md`, implemented per
  language.
- Backend quirks that have no shared counterpart: Pebble's `Map.Entry`
  iteration and single-variable `for`, Twig/Blade/Pebble's non-scoped `set`,
  Perl's `sort keys` ordering, MiniJinja's `loop` reserved name (#3404).

## Proposed shape

Put the semantic decisions in `@barefootjs/jsx`'s `adapters/` directory as
**plans** — data the adapter renders, not strings:

- `planLoop(loop, scope, ctx)` → `{ markers, bindings: [{ name, source }],
  restore: [name], sort: 'eval' | 'structured' | 'raw' | 'refuse', filter,
  keyAnchor, preamble }` — one object per `IRLoop`, the output of the decisions
  listed under `renderLoop`. The adapter's `renderLoop` becomes a loop over
  the plan, spelling each entry with its hooks.
- `planAttr(value, ctx)` → `{ kind: 'omit-nullable' | 'presence' | 'conditional'
  | 'template' | 'spread' | 'plain', boolStr, tmp }` for `elementAttrEmitter`.
- `ARRAY_METHOD_CATALOGUE: Record<ArrayMethod, { helper: HelperId; defaults }>`
  for `renderArrayMethod`, and `lowerCallbackMethod(method, arrow, …)` returning
  `{ kind: 'eval' | 'structured' | 'refuse', … }` for `callbackMethod`.
- A `DslSyntax` hook interface each adapter implements once: `comment`,
  `setLocal`, `forHeader`, `restoreLocal`, `ifOpen` / `ifClose`, `nilTest`,
  `truthy`, `escape`, `ident`, `hashKey`, `stringLiteral`, `nullLiteral`,
  `helper(id)`. The existing `ParsedExprEmitter` / `IRNodeEmitter` /
  `AttrValueEmitter` dispatchers stay; the hooks sit under them.

The contract that makes this worth doing is the one AGENTS.md already states
for the Go adapter: a cross-adapter test that pins every DSL adapter to the
same plan for the same fixture, so a drift is a test failure rather than a
review finding. The adapter-tests conformance corpus is that test for the
rendered HTML; the plan layer needs its own, smaller one at the plan level.

Order of work: start with the groups that would have collapsed the most
recent fixes, and with the ones whose copies already agree (so the first PRs
are byte-identical). Each extraction is one PR per group, output-preserving,
verified by every adapter suite — the same rule `spec/adapter-architecture.md`
sets for the Go adapter.

## Follow-up issues

Ordered by how many of the recent multi-adapter fixes each group would have
collapsed into one change. Groups 1 and 2 are the ones with fixes in the window
to point at; the rest have none and are ordered by expected risk, lowest first.

1. **Loop binding plan** (`renderLoop`'s name decisions: item/index/key,
   destructure, preamble, filter captures, shadow restore). Would have
   collapsed #3391 (3 adapters), #3392 (2), #3396/#3402 (7), #3404 (six
   commits over 4–5 adapters), #3386, #3408, #3369 — 15 commits.
2. **Arithmetic and number lowering** (`binary`, `unary`,
   `coerceNullishOperand`, `groupBinaryOperand`, JS number notation). Would
   have collapsed #3350 (two commits, 6 and 4 adapters), #3380 (two commits,
   6 and 3), #3390 (8), #3359 (Go) — 6 commits, and would close the
   four-adapter gap in nullish coercion either way.
3. **Lift the verbatim copies** (the first list under Classification) into
   `@barefootjs/jsx/adapters`. No recent fix to collapse, but zero semantic
   risk and it removes about 500 lines per adapter from review.
4. **Array/string method catalogue** (`renderArrayMethod` as a table keyed by
   helper id). No recent multi-adapter fix to collapse: the `?.length` /
   own-`length` family (#3332 → #3422) was fixed in the runtimes' `length`
   helpers and in the member arm of each expression emitter
   (`optionalLength`), not in `renderArrayMethod`, and the catalogue has no
   `length` entry. A member-expression plan (optional chaining, `length`
   routing) is where that family would have collapsed; it belongs with
   group 2's emitter work.
5. **Callback-method chain** (`callbackMethod`: eval → structured → refuse,
   one BF101 wording, and the evaluator emitters' literal / escape /
   environment / invocation hooks).
6. **Attribute emission plan** (`elementAttrEmitter`): nullable omission,
   presence, `bool_str`, conditional, spread.
7. **Component prop assembly** (`renderComponent` and the spread segments
   ERB/Mojolicious lack): verify the spread-onto-component fixture on those
   two first; the fix, if any, lands as a fixture.
