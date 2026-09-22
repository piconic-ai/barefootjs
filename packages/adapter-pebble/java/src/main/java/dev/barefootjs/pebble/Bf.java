package dev.barefootjs.pebble;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.google.gson.ToNumberPolicy;
import dev.barefootjs.pebble.eval.Evaluator;
import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.extension.escaper.SafeString;
import io.pebbletemplates.pebble.template.PebbleTemplate;

import java.io.IOException;
import java.io.StringWriter;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The `bf` global — every helper the Pebble adapter's compiled `.peb`
 * templates call as `bf.method(...)`. Registered as a fresh instance per
 * render (see {@link Main}), so a per-render counter/state field (used by
 * the hydration-marker helpers) never leaks between renders.
 *
 * <p>Two families of methods live here, kept in ONE class per the
 * `add-adapter` task's "single god-class is fine for the bf helper
 * surface" allowance:
 *
 * <ul>
 *   <li><b>Pure value helpers</b> — the shared, language-neutral catalogue
 *       in {@code spec/template-helpers.md}, golden-vector tested
 *       (see {@code BfHelperVectorsTest}). These have exactly one
 *       correct behavior, computed by executing the JS reference.
 *   <li><b>Render-state helpers</b> — hydration markers, script
 *       registration, context provide/use, spread/style attribute
 *       rendering, cross-template child invocation. These are NOT covered
 *       by the shared spec (`spec/template-helpers.md`'s own "Scope"
 *       section excludes them) and their exact byte-for-byte shape is
 *       validated against the shared fixture corpus in Phase 4
 *       (out of scope for this PR) — implemented here with a reasonable,
 *       structurally-consistent shape (mirroring the marker conventions in
 *       `packages/shared/src/markers.ts`) sufficient to prove the
 *       hand-written `.peb` smoke tests in
 *       `packages/adapter-pebble/src/__tests__/` render end-to-end.
 * </ul>
 *
 * <p>Every `.map()/.filter()/.reduce()/.sort()/.find()` callback body that
 * doesn't lower to native Pebble syntax arrives as a serialized-JSON
 * `ParsedExpr` tree, evaluated via {@link Evaluator} (`bf.*_eval` methods
 * below).
 */
public final class Bf {

  /** Numbers-as-double, matching every OTHER JSON boundary in this runtime (see JsNumber). */
  private static final Gson GSON = new GsonBuilder()
      .setObjectToNumberStrategy(ToNumberPolicy.DOUBLE)
      .create();

  /** This render's own scope id (`bf.scope_attr()`), e.g. "ComponentName_test". */
  private final String rootScopeId;

  /** Shared across every `Bf` instance in one render tree (root + every `render_child` descendant) — needed to resolve `bf.render_child(...)` against sibling `.peb` files. `null` for a `Bf` built without one (every hand-written-`.peb`-template smoke test and golden-vector test in this package) — `render_child` throws a clear error rather than a `NullPointerException` in that case. */
  private final PebbleEngine engine;

  /** `snake_case template name -> ChildMeta`, read once by {@link Main} from the optional `_bf_manifest.json` sidecar. Never `null` — empty when absent. */
  private final Map<String, ChildMeta> manifest;

  /** True for every `Bf` `render_child` mints; false for the render's own root instance. Drives `bf-r` (hydration_attrs) and nothing else. */
  private final boolean isChild;

  /** `_bf_parent` — the HOST component's scope id, when this scope is slot-attached (`bf-h`). `null` for a loop-item / non-slot child, and for the root. */
  private final String bfHost;

  /** `_bf_mount` — the slot id inside the host where this scope is mounted (`bf-m`). `null` unless `bfHost` is also set. */
  private final String bfMount;

  /** JSX `key` prop popped by `render_child`, threaded onto `data_key_attr()`. `null` unless this is a keyed loop-row child. */
  private final Object dataKey;

  /** Props payload for `props_attr()`/`scope_comment()`'s `bf-p`/props-JSON segment. Never populated by `render_child` (mirrors the Jinja/Rust ports, where the equivalent field is likewise always absent for a CHILD — see this class's own render-state-helpers header); every helper vector / hand-written-`.peb` smoke test in this package also leaves it `null`. A REAL production root render DOES need it set — see the `(String, PebbleEngine, Map, Object)` constructor and {@link #newRoot(String, Bf, Object)}, both added for exactly that (`integrations/spring`'s `Render.renderRoot`). */
  private final Object markerProps;

  /**
   * `provide_context`/`revoke_context`/`use_context`'s backing store —
   * SHARED (the same {@link Map} REFERENCE, never copied) across every
   * `Bf` instance in one render tree, root through every `render_child`
   * descendant at any depth. A context provided by a parent must be
   * visible to a child rendered via a SEPARATE `Bf` instance a level (or
   * several) down — e.g. `<ThemeContext.Provider>` wrapping a
   * cross-template `<ThemeLabel/>` call. Mirrors the Python runtime's
   * module-level `_CONTEXT_STACKS` global and the Rust runtime's
   * `Arc<RenderSession>`-shared `context_stacks` — both deliberately
   * NOT per-instance state, for exactly this reason.
   */
  private final Map<String, java.util.Deque<Object>> contextStacks;

  /**
   * `register_script`/`register_preload`'s backing store — SHARED (the same
   * {@link List}/{@link Set} REFERENCES, never copied) across every `Bf`
   * instance in one render tree, root through every `render_child`
   * descendant at any depth, exactly like {@link #contextStacks} above.
   * Mirrors the Rust runtime's `Arc<RenderSession>`-shared
   * `scripts`/`script_seen` (`packages/adapter-rust/runtime/src/
   * runtime.rs`): the compiled `.peb` template's own inline
   * `{% set _bf_regN = bf.register_script(...) %}` calls (see
   * `pebble-adapter.ts`'s `generateScriptRegistrations`) discard the
   * returned tag string, so the ONLY way a host application (e.g. the
   * Spring integration) recovers the accumulated `<script>`/`<link
   * rel="modulepreload">` tags for the whole render tree is this shared
   * side-effect state, read back via {@link #scripts()} on the ROOT `Bf`
   * instance after `template.evaluate(...)` returns.
   *
   * <p>Unlike a plain `render_child` recursion (single call stack, no
   * concurrency), {@link #newRoot(String, Bf, Object)} makes this bundle
   * reachable from genuinely independent top-level island renders — a host
   * MAY render sibling islands on separate threads. {@code scripts} (this
   * field) doubles as the shared monitor every mutator/reader synchronizes
   * on ({@link #register_script}, {@link #register_preload}, {@link
   * #scripts()}) to keep the four-field bundle's check-then-add invariant
   * atomic; `contextStacks` has the same latent multi-root-sharing shape
   * but is unsynchronized pre-existing code, not touched by the `newRoot`
   * work — a candidate for the same treatment in a follow-up, not bundled
   * in here.
   */
  private final List<String> scripts;

  private final Set<String> scriptSeen;

  private final List<String> preloads;

  private final Set<String> preloadSeen;

  /**
   * `register_portal_element`/`portals()`'s backing store — SHARED (the
   * same {@link List} REFERENCE, never copied) across every {@code Bf}
   * instance in one render tree, exactly like {@link #scripts} above
   * (#3119). Collects an {@code ssrPortalOwnerScope}-flagged element's
   * already-rendered markup (`pebble-adapter.ts`'s
   * {@code wrapSsrPortalElement} captures it via a {@code {% set %}}
   * block before calling here) so it can be emitted at the
   * {@link #portals()} outlet near {@code </body>} instead of at its
   * source position — the {@code ref}-callback SSR-portal pattern the
   * dialog-style primitives use (`DialogOverlay`/`DialogContent`,
   * `DropdownMenuContent`, `PopoverContent`, the explicit `<Portal>`
   * component). Synchronized on {@link #scripts} — the SAME shared
   * monitor {@link #register_script}/{@link #scripts()} already use —
   * rather than a second lock, for the identical reason {@code scripts}'s
   * own doc comment gives: {@link #newRoot(String, Bf, Object)} makes
   * this bundle reachable from genuinely independent top-level island
   * renders, not just a single-threaded {@code render_child} recursion.
   */
  private final List<String> portalElements;

  public Bf(String rootScopeId) {
    this(rootScopeId, null, Map.of());
  }

  public Bf(String rootScopeId, PebbleEngine engine, Map<String, ChildMeta> manifest) {
    this(rootScopeId, engine, manifest, null);
  }

  /**
   * Like {@link #Bf(String, PebbleEngine, Map)}, but ALSO seeding this
   * root's {@code bf-p} hydration-payload marker (see
   * {@link #props_attr()}/{@link #scope_comment}) with {@code rootProps} —
   * needed for a REAL production host (this Java runtime's own conformance
   * harness never populates it — see {@link #markerProps}'s doc comment —
   * but a real page render must, or the client runtime re-hydrates a
   * `@client` root's reactive state from NOTHING rather than the actual
   * props it was rendered with, silently discarding an SSR'd list/object
   * prop on hydration). Mirrors `render.rs`'s `render_root` setting
   * `root.props = Some(props.clone())` whenever `props` is non-empty, for
   * every `BfInstance::root(...)` call (`render_component` AND
   * `render_island`) — same rule applied here: pass `null` (or an empty
   * map) when there is genuinely nothing to seed.
   */
  public Bf(String rootScopeId, PebbleEngine engine, Map<String, ChildMeta> manifest, Object rootProps) {
    this(
        rootScopeId,
        engine,
        manifest,
        false,
        null,
        null,
        null,
        rootProps,
        new LinkedHashMap<>(),
        new ArrayList<>(),
        new java.util.LinkedHashSet<>(),
        new ArrayList<>(),
        new java.util.LinkedHashSet<>(),
        new ArrayList<>());
  }

  /**
   * A SECOND page-level root sharing {@code sibling}'s accumulator state
   * (scripts/preloads/context-provide-stacks) — for composing one page out
   * of several independently-rendered top-level islands (a region-shell
   * layout: a shared header island, a sidebar island, and a main-content
   * island, e.g. `integrations/spring`'s blog routes). Mirrors the Rust
   * runtime's `BfInstance::root(Arc::clone(session), scope_id)`, which is
   * called once per island but always against the SAME cloned
   * `Arc&lt;RenderSession&gt;` — every island's `register_script` call must
   * land in the ONE accumulator the page reads back after composing every
   * island's HTML, or an island rendered after the first would never
   * contribute its own script tag. Like {@link #root}-shaped construction
   * generally (see {@link #render_child}'s non-slotted branch), this is NOT
   * a child (`isChild=false`, no host/mount/data-key) — it is a second
   * independent top-level render that merely happens to share render-tree
   * state with the first. `rootProps` seeds THIS island's OWN `bf-p` marker
   * (see the {@code (String, PebbleEngine, Map, Object)} constructor above)
   * — independent of whatever `sibling`'s own marker holds.
   */
  public static Bf newRoot(String rootScopeId, Bf sibling, Object rootProps) {
    return new Bf(
        rootScopeId,
        sibling.engine,
        sibling.manifest,
        false,
        null,
        null,
        null,
        rootProps,
        sibling.contextStacks,
        sibling.scripts,
        sibling.scriptSeen,
        sibling.preloads,
        sibling.preloadSeen,
        sibling.portalElements);
  }

  /** {@link #newRoot(String, Bf, Object)} with no `bf-p` marker to seed. */
  public static Bf newRoot(String rootScopeId, Bf sibling) {
    return newRoot(rootScopeId, sibling, null);
  }

  private Bf(
      String rootScopeId,
      PebbleEngine engine,
      Map<String, ChildMeta> manifest,
      boolean isChild,
      String bfHost,
      String bfMount,
      Object dataKey,
      Object markerProps,
      Map<String, java.util.Deque<Object>> contextStacks,
      List<String> scripts,
      Set<String> scriptSeen,
      List<String> preloads,
      Set<String> preloadSeen,
      List<String> portalElements) {
    this.rootScopeId = rootScopeId == null ? "" : rootScopeId;
    this.engine = engine;
    this.manifest = manifest == null ? Map.of() : manifest;
    this.isChild = isChild;
    this.bfHost = bfHost;
    this.bfMount = bfMount;
    this.dataKey = dataKey;
    this.markerProps = markerProps;
    this.contextStacks = contextStacks;
    this.scripts = scripts;
    this.scriptSeen = scriptSeen;
    this.preloads = preloads;
    this.preloadSeen = preloadSeen;
    this.portalElements = portalElements;
  }

  // =========================================================================
  // Coercion / equality (pervasive — used at nearly every interpolation and
  // condition-test position the TS adapter emits).
  // =========================================================================

  /**
   * JS `String(v)` — see the file header, divergence 2.
   *
   * <p>Returns {@code Object}, not {@code String}: a {@link SafeString}
   * input (the JSX-children/named-slot capture forwarded through
   * `bf.render_child`'s `children` prop — see {@link #render_child}) is
   * passed through UNCHANGED rather than flattened to a plain
   * `java.lang.String`. Every OTHER text-interpolation position in a
   * compiled `.peb` template routes through `bf.string(...)` — including a
   * bare `{{ bf.string(children) }}` reference with NO `| raw` filter, the
   * exact shape emitted for `<div>{children}</div>` — so if this method
   * downgraded a `SafeString` to a plain `String`, Pebble's own
   * `EscapeFilter` (which recognizes `SafeString` and skips escaping ONLY
   * when the print statement's value IS one) would silently
   * double-HTML-escape every forwarded child. Mirrors the Python
   * runtime's `js_string`'s `isinstance(value, str): return value`
   * passthrough for a `Markup` instance (Markup subclasses `str`) and
   * minijinja's `resolve_child_vars`/`render_child` docstring, which
   * documents the identical hazard for its own safe-`Value` domain.
   */
  public Object string(Object v) {
    if (v instanceof SafeString) {
      return v;
    }
    // Deliberate divergence from strict JS `String(null) === "null"`,
    // pinned in `vector-divergences.json` ("string/null renders as the
    // string \"null\"") — matches EVERY other language port
    // (Python/Rust/Perl/PHP/Go/Ruby): an absent/optional prop (a JS
    // `undefined` this runtime's single `null` collapses onto, same as
    // every other port's `None`/`nil`) must not surface a literal "null"
    // in text-interpolation position — real JSX (Hono's reference) renders
    // `{null}`/`{undefined}` as nothing. `JsValue.jsString` itself stays
    // strictly JS-faithful (`"null"`) for every OTHER caller in this class
    // (`concat`, `replace`, …) — none of those positions' golden vectors
    // ever probe a `null` element, so this divergence is scoped to exactly
    // the one call site that needed it.
    if (v == null) {
      return "";
    }
    return JsValue.jsString(v);
  }

  /** `String(boolean)` for a props/signal value the analyzer proved is boolean-typed (#1897). */
  public String bool_str(Object v) {
    return JsValue.jsString(v);
  }

  /** Every non-boolean-shaped condition-test position (divergence 1). Always a real boolean. */
  public boolean truthy(Object v) {
    return JsValue.truthy(v);
  }

  /** JS `===` (divergence 4 — never a native Pebble equality operator). */
  public boolean eq(Object a, Object b) {
    return JsValue.strictEquals(a, b);
  }

  /** JS `!==`. */
  public boolean neq(Object a, Object b) {
    return !JsValue.strictEquals(a, b);
  }

  /**
   * JS `??`. Stock Pebble has NO `??`/coalescing operator at all, confirmed
   * empirically (a real {@code io.pebbletemplates.pebble.error.ParserException}
   * on `{{ a ?? b }}`) — see this package's README, "Divergence 3". The TS
   * adapter's `expr/emitters.ts` `logical()` routes every JS `??` through
   * this helper instead of emitting the native (nonexistent) operator.
   */
  public Object coalesce(Object a, Object b) {
    return a == null ? b : a;
  }

  /**
   * `isValidElement(x)` — the framework "is this a renderable element (not
   * plain text)?" predicate `Slot`'s `asChild` pattern (#2266) uses to
   * decide whether to merge props into a child ELEMENT
   * (`children.tag`/`children.props`) or fall back to rendering `children`
   * as-is. Mirrors JS's `'tag' in x && 'props' in x`: true only for a
   * {@link Map} carrying both keys, checked case-insensitively to match the
   * Go/Ruby ports' own case-insensitive shape-check (NOT {@link #fieldOf}/
   * {@link #get} elsewhere in this class, which are exact-key lookups). A
   * passed-through JSX child is represented as pre-rendered markup (a plain
   * String) on this SSR model, so a non-empty STRING child is NOT a valid
   * element — routing `isValidElement` through bare truthiness would
   * wrongly take the element-merge branch. Ported from the Go runtime's
   * `IsValidElement` / the Ruby port's `is_element` (#3022, porting
   * #3011/#3012 to this adapter).
   */
  public boolean is_element(Object v) {
    if (!(v instanceof Map)) {
      return false;
    }
    boolean hasTag = false;
    boolean hasProps = false;
    for (Object k : ((Map<?, ?>) v).keySet()) {
      String key = String.valueOf(k).toLowerCase(java.util.Locale.ROOT);
      if (key.equals("tag")) {
        hasTag = true;
      }
      if (key.equals("props")) {
        hasProps = true;
      }
    }
    return hasTag && hasProps;
  }

  /**
   * Dynamic member/index access (`obj[expr]`) — divergence in the file
   * header's "Member/index access" section. Arrays index numerically
   * (JS `Number()` coercion of the key, out-of-range -> null); maps index
   * by the key's string form (JS object-property semantics: every key is
   * ultimately a string).
   */
  @SuppressWarnings("unchecked")
  public Object get(Object receiver, Object key) {
    if (receiver instanceof List) {
      double idx = JsNumber.jsNumber(key);
      List<?> list = (List<?>) receiver;
      if (idx != Math.floor(idx) || idx < 0 || idx >= list.size()) {
        return null;
      }
      return list.get((int) idx);
    }
    if (receiver instanceof Map) {
      Map<String, Object> m = (Map<String, Object>) receiver;
      String k = JsValue.jsString(key);
      return m.containsKey(k) ? m.get(k) : null;
    }
    return null;
  }

  /**
   * Shallow `Object.assign`-style merge (spread props, `{...a, ...b}`).
   * Later maps win.
   *
   * <p>Takes a single Pebble LIST-literal argument (`bf.merge([a, b, c])`),
   * NOT a Java varargs parameter — confirmed via Pebble's own
   * `MemberCacheUtils.getCandidates` (`pebble/attributes/
   * MemberCacheUtils.java`): its method resolver requires an EXACT
   * `types.length == requiredTypes.length` match against
   * `Method.getParameterTypes().length`, which for a varargs method counts
   * the trailing array as ONE parameter — so a Pebble call site passing N
   * discrete arguments (any N other than the exact declared arity) can
   * NEVER match a varargs method at all; it silently resolves to nothing
   * and renders empty/`null` under `strictVariables(false)`, with no error.
   * This is a genuine, confirmed Pebble-specific limitation (not present in
   * Jinja/Twig/minijinja, which all accept genuine variadic calls) — every
   * `Bf` method an unbounded-arity call site needs (this one,
   * `flat_map_tuple`, `query`, `style_object`) takes a single list argument
   * instead; see `pebble-naming.ts`/`emitters.ts`'s call sites, which wrap
   * their argument lists in `[...]` for exactly this reason.
   */
  @SuppressWarnings("unchecked")
  public Map<String, Object> merge(Object mapsListArg) {
    Map<String, Object> out = new LinkedHashMap<>();
    List<?> maps = mapsListArg instanceof List ? (List<?>) mapsListArg : List.of();
    for (Object m : maps) {
      if (m instanceof Map) {
        out.putAll((Map<String, Object>) m);
      }
    }
    return out;
  }

  /** `Object.entries(map)` -> `[[k, v], ...]`, insertion order. */
  @SuppressWarnings("unchecked")
  public List<Object> entries(Object map) {
    List<Object> out = new ArrayList<>();
    if (map instanceof Map) {
      for (Map.Entry<String, Object> e : ((Map<String, Object>) map).entrySet()) {
        List<Object> pair = new ArrayList<>();
        pair.add(e.getKey());
        pair.add(e.getValue());
        out.add(pair);
      }
    }
    return out;
  }

  /** `Object.keys(map)`. */
  public List<Object> keys(Object map) {
    List<Object> out = new ArrayList<>();
    if (map instanceof Map) {
      out.addAll(((Map<?, ?>) map).keySet());
    }
    return out;
  }

  /** `Object.values(map)`. */
  @SuppressWarnings("unchecked")
  public List<Object> values(Object map) {
    List<Object> out = new ArrayList<>();
    if (map instanceof Map) {
      out.addAll(((Map<String, Object>) map).values());
    }
    return out;
  }

  /** Object-rest destructuring residual (`{ id, ...rest }` -> `rest`): every key NOT excluded. */
  @SuppressWarnings("unchecked")
  public Map<String, Object> omit(Object map, Object excludeKeys) {
    Map<String, Object> out = new LinkedHashMap<>();
    if (!(map instanceof Map)) {
      return out;
    }
    List<Object> exclude = excludeKeys instanceof List ? (List<Object>) excludeKeys : List.of();
    List<String> excludeStr = new ArrayList<>();
    for (Object k : exclude) {
      excludeStr.add(JsValue.jsString(k));
    }
    for (Map.Entry<String, Object> e : ((Map<String, Object>) map).entrySet()) {
      if (!excludeStr.contains(e.getKey())) {
        out.put(e.getKey(), e.getValue());
      }
    }
    return out;
  }

  // =========================================================================
  // Arithmetic / number (spec/template-helpers.md)
  // =========================================================================

  public double add(Object a, Object b) {
    return JsNumber.toDouble(a) + JsNumber.toDouble(b);
  }

  public double sub(Object a, Object b) {
    return JsNumber.toDouble(a) - JsNumber.toDouble(b);
  }

  public double mul(Object a, Object b) {
    return JsNumber.toDouble(a) * JsNumber.toDouble(b);
  }

  public double div(Object a, Object b) {
    return JsNumber.toDouble(a) / JsNumber.toDouble(b);
  }

  public double mod(Object a, Object b) {
    return JsNumber.jsMod(JsNumber.toDouble(a), JsNumber.toDouble(b));
  }

  public double neg(Object a) {
    return -JsNumber.toDouble(a);
  }

  public double number(Object v) {
    return JsNumber.jsNumber(v);
  }

  public double floor(Object v) {
    return Math.floor(JsNumber.jsNumber(v));
  }

  public double ceil(Object v) {
    return Math.ceil(JsNumber.jsNumber(v));
  }

  public double round(Object v) {
    return JsNumber.jsRound(JsNumber.jsNumber(v));
  }

  // `Math.min`/`Math.max`/`Math.abs` apply JS `Number()` coercion to a
  // non-number operand (a non-numeric string coerces to NaN, which then
  // propagates) — unlike `add`/`sub`/`mul`, whose vector domain never
  // probes a non-number operand, so `jsNumber` (full coercion) is used
  // here rather than the stricter `toDouble`.
  public double min(Object a, Object b) {
    return Math.min(JsNumber.jsNumber(a), JsNumber.jsNumber(b));
  }

  public double max(Object a, Object b) {
    return Math.max(JsNumber.jsNumber(a), JsNumber.jsNumber(b));
  }

  public double abs(Object v) {
    return Math.abs(JsNumber.jsNumber(v));
  }

  public String to_fixed(Object v) {
    return to_fixed(v, 0.0);
  }

  public String to_fixed(Object v, Object digits) {
    return JsNumber.toFixed(JsNumber.jsNumber(v), (int) JsNumber.jsNumber(digits));
  }

  /**
   * JS {@code JSON.stringify(v)}, single-argument form. NOT delegated to
   * Gson's own number serialization — Gson always prints a `double` with a
   * decimal point (`42.0`), which would re-introduce exactly the
   * long/double-split artifact {@link JsNumber} exists to prevent
   * (JS `JSON.stringify(42)` -> `"42"`). Numbers route through
   * {@link JsNumber#numberToString} instead; object key order is
   * insertion order (a {@link Map} here is always a {@link LinkedHashMap}).
   */
  public String json(Object v) {
    StringBuilder sb = new StringBuilder();
    writeJson(v, sb);
    return sb.toString();
  }

  @SuppressWarnings("unchecked")
  private static void writeJson(Object v, StringBuilder sb) {
    if (v == null) {
      sb.append("null");
      return;
    }
    if (v instanceof String) {
      writeJsonString((String) v, sb);
      return;
    }
    if (v instanceof Boolean) {
      sb.append(((Boolean) v) ? "true" : "false");
      return;
    }
    if (v instanceof Number) {
      double d = ((Number) v).doubleValue();
      // JS `JSON.stringify` renders a non-finite number as `null` (it is
      // not valid JSON) — out of the vector-tested domain per
      // spec/template-helpers.md's `json` entry, but a safe total fallback.
      sb.append(Double.isFinite(d) ? JsNumber.numberToString(d) : "null");
      return;
    }
    if (v instanceof List) {
      sb.append('[');
      List<Object> list = (List<Object>) v;
      for (int i = 0; i < list.size(); i++) {
        if (i > 0) {
          sb.append(',');
        }
        writeJson(list.get(i), sb);
      }
      sb.append(']');
      return;
    }
    if (v instanceof Map) {
      sb.append('{');
      boolean first = true;
      for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) {
        if (!first) {
          sb.append(',');
        }
        first = false;
        writeJsonString(e.getKey(), sb);
        sb.append(':');
        writeJson(e.getValue(), sb);
      }
      sb.append('}');
      return;
    }
    writeJsonString(String.valueOf(v), sb);
  }

  private static void writeJsonString(String s, StringBuilder sb) {
    sb.append('"');
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"':
          sb.append("\\\"");
          break;
        case '\\':
          sb.append("\\\\");
          break;
        case '\n':
          sb.append("\\n");
          break;
        case '\r':
          sb.append("\\r");
          break;
        case '\t':
          sb.append("\\t");
          break;
        default:
          if (c < 0x20) {
            sb.append(String.format("\\u%04x", (int) c));
          } else {
            sb.append(c);
          }
      }
    }
    sb.append('"');
  }

  // =========================================================================
  // Date / format_date (#2274/#2288/#2324/#2334)
  // =========================================================================

  private static Instant toInstant(Object recv) {
    if (recv instanceof Instant) {
      return (Instant) recv;
    }
    if (recv instanceof String) {
      try {
        return Instant.parse((String) recv);
      } catch (DateTimeParseException e) {
        return null;
      }
    }
    return null;
  }

  /** Zero-arg `Date.prototype` accessor subset the compiler's lowering plugin recognizes. */
  public Object date(Object recv, String op) {
    Instant instant = toInstant(recv);
    if (instant == null) {
      return op.equals("toISOString") ? "" : 0.0;
    }
    if (op.equals("toISOString")) {
      ZonedDateTime z = instant.atZone(ZoneOffset.UTC);
      long millisOfSecond = Math.floorDiv(instant.getNano(), 1_000_000L);
      return String.format("%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
          z.getYear(), z.getMonthValue(), z.getDayOfMonth(),
          z.getHour(), z.getMinute(), z.getSecond(), millisOfSecond);
    }
    if (op.equals("getTime")) {
      return (double) instant.toEpochMilli();
    }
    ZonedDateTime z = instant.atZone(ZoneOffset.UTC);
    switch (op) {
      case "getUTCFullYear":
        return (double) z.getYear();
      case "getUTCMonth":
        return (double) (z.getMonthValue() - 1);
      case "getUTCDate":
        return (double) z.getDayOfMonth();
      case "getUTCHours":
        return (double) z.getHour();
      case "getUTCMinutes":
        return (double) z.getMinute();
      case "getUTCSeconds":
        return (double) z.getSecond();
      default:
        return 0.0;
    }
  }

  private static final Pattern FORMAT_TOKEN =
      Pattern.compile("YYYY|MMMM|MMM|MM|DD|dddd|ddd|M|D");

  /** Pure-function date formatter (#2324/#2334) — see spec/template-helpers.md's `format_date`. */
  public String format_date(Object recv, String pattern, String tz, Object namesObj) {
    Instant instant = toInstant(recv);
    if (instant == null) {
      return "";
    }
    ZoneOffset offset = resolveOffset(tz, instant);
    ZonedDateTime z = instant.atOffset(offset).toZonedDateTime();

    List<?> names = namesObj instanceof List ? (List<?>) namesObj : List.of();

    StringBuilder out = new StringBuilder();
    Matcher m = FORMAT_TOKEN.matcher(pattern);
    int last = 0;
    while (m.find()) {
      out.append(pattern, last, m.start());
      out.append(formatToken(m.group(), z, names));
      last = m.end();
    }
    out.append(pattern.substring(last));
    return out.toString();
  }

  private static String formatToken(String token, ZonedDateTime z, List<?> names) {
    switch (token) {
      case "YYYY": {
        int y = z.getYear();
        String digits = String.format("%04d", Math.abs(y));
        return y < 0 ? "-" + digits : digits;
      }
      case "MM":
        return String.format("%02d", z.getMonthValue());
      case "DD":
        return String.format("%02d", z.getDayOfMonth());
      case "M":
        return String.valueOf(z.getMonthValue());
      case "D":
        return String.valueOf(z.getDayOfMonth());
      case "MMMM":
        return nameAt(names, z.getMonthValue() - 1);
      case "MMM":
        return nameAt(names, 12 + (z.getMonthValue() - 1));
      case "dddd":
        return nameAt(names, 24 + jsDayOfWeek(z));
      case "ddd":
        return nameAt(names, 31 + jsDayOfWeek(z));
      default:
        return "";
    }
  }

  private static String nameAt(List<?> names, int index) {
    if (index < 0 || index >= names.size()) {
      return "";
    }
    Object v = names.get(index);
    return v == null ? "" : JsValue.jsString(v);
  }

  /**
   * Sunday-first day-of-week (0=Sunday...6=Saturday), matching JS
   * `getUTCDay()` — epoch day 0 (1970-01-01) is a Thursday, i.e. index 4.
   * `epochDay + 4`, floor-mod 7, lands on 4 at epochDay 0 and is stable for
   * negative epoch days (pre-1970) via the double-mod (`% 7` in Java can be
   * negative for a negative dividend — see `JsNumber`'s own note on `%`).
   */
  private static int jsDayOfWeek(ZonedDateTime z) {
    long epochDay = z.toLocalDate().toEpochDay();
    return (int) (((epochDay + 4) % 7 + 7) % 7);
  }

  private static ZoneOffset resolveOffset(String tz, Instant instant) {
    if (tz.equals("UTC")) {
      return ZoneOffset.UTC;
    }
    if (tz.matches("[+-]\\d{2}:\\d{2}")) {
      return ZoneOffset.of(tz);
    }
    ZoneId zoneId = ZoneId.of(tz); // throws for unknown/misspelled zones, matching JS's RangeError
    return zoneId.getRules().getOffset(instant);
  }

  // =========================================================================
  // String
  // =========================================================================

  public String lc(Object v) {
    return JsValue.jsString(v).toLowerCase();
  }

  public String uc(Object v) {
    return JsValue.jsString(v).toUpperCase();
  }

  public String trim(Object v) {
    return jsTrim(JsValue.jsString(v), true, true);
  }

  public String trim_start(Object v) {
    return jsTrim(JsValue.jsString(v), true, false);
  }

  public String trim_end(Object v) {
    return jsTrim(JsValue.jsString(v), false, true);
  }

  private static boolean isJsWhitespace(char c) {
    return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == 0x0B;
  }

  private static String jsTrim(String s, boolean start, boolean end) {
    int a = 0;
    int b = s.length();
    if (start) {
      while (a < b && isJsWhitespace(s.charAt(a))) {
        a++;
      }
    }
    if (end) {
      while (b > a && isJsWhitespace(s.charAt(b - 1))) {
        b--;
      }
    }
    return s.substring(a, b);
  }

  public boolean starts_with(Object v, Object prefix) {
    return starts_with(v, prefix, 0.0);
  }

  public boolean starts_with(Object v, Object prefix, Object position) {
    String s = JsValue.jsString(v);
    int pos = clamp((int) JsNumber.jsNumber(position), 0, s.length());
    return s.startsWith(JsValue.jsString(prefix), pos);
  }

  public boolean ends_with(Object v, Object suffix) {
    String s = JsValue.jsString(v);
    return ends_with(v, suffix, (double) s.length());
  }

  public boolean ends_with(Object v, Object suffix, Object endPosition) {
    String s = JsValue.jsString(v);
    int end = clamp((int) JsNumber.jsNumber(endPosition), 0, s.length());
    String truncated = s.substring(0, end);
    return truncated.endsWith(JsValue.jsString(suffix));
  }

  private static int clamp(int v, int lo, int hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  public String replace(Object v, Object pattern, Object replacement) {
    String s = JsValue.jsString(v);
    String pat = JsValue.jsString(pattern);
    String rep = JsValue.jsString(replacement);
    int idx = pat.isEmpty() ? 0 : s.indexOf(pat);
    if (pat.isEmpty()) {
      return rep + s;
    }
    if (idx < 0) {
      return s;
    }
    return s.substring(0, idx) + rep + s.substring(idx + pat.length());
  }

  public String replace_all(Object v, Object pattern, Object replacement) {
    String s = JsValue.jsString(v);
    String pat = JsValue.jsString(pattern);
    String rep = JsValue.jsString(replacement);
    if (pat.isEmpty()) {
      StringBuilder sb = new StringBuilder(rep);
      for (int i = 0; i < s.length(); i++) {
        sb.append(s.charAt(i)).append(rep);
      }
      return sb.toString();
    }
    return s.replace(pat, rep);
  }

  public String repeat(Object v, Object count) {
    String s = JsValue.jsString(v);
    int n = (int) JsNumber.jsNumber(count);
    return s.repeat(Math.max(0, n));
  }

  public String pad_start(Object v, Object targetLength) {
    return pad_start(v, targetLength, " ");
  }

  public String pad_start(Object v, Object targetLength, Object pad) {
    return jsPad(JsValue.jsString(v), (int) JsNumber.jsNumber(targetLength), JsValue.jsString(pad), true);
  }

  public String pad_end(Object v, Object targetLength) {
    return pad_end(v, targetLength, " ");
  }

  public String pad_end(Object v, Object targetLength, Object pad) {
    return jsPad(JsValue.jsString(v), (int) JsNumber.jsNumber(targetLength), JsValue.jsString(pad), false);
  }

  private static String jsPad(String s, int target, String pad, boolean start) {
    if (pad.isEmpty() || s.length() >= target) {
      return s;
    }
    int need = target - s.length();
    StringBuilder fill = new StringBuilder();
    while (fill.length() < need) {
      fill.append(pad);
    }
    String fillStr = fill.substring(0, need);
    return start ? fillStr + s : s + fillStr;
  }

  public List<Object> split(Object v) {
    List<Object> out = new ArrayList<>();
    out.add(JsValue.jsString(v));
    return out;
  }

  public List<Object> split(Object v, Object separator) {
    return splitImpl(JsValue.jsString(v), JsValue.jsString(separator), -1);
  }

  public List<Object> split(Object v, Object separator, Object limit) {
    return splitImpl(JsValue.jsString(v), JsValue.jsString(separator), (int) JsNumber.jsNumber(limit));
  }

  private static List<Object> splitImpl(String s, String sep, int limit) {
    List<Object> out = new ArrayList<>();
    if (limit == 0) {
      return out;
    }
    if (sep.isEmpty()) {
      for (int i = 0; i < s.length(); i++) {
        if (limit >= 0 && out.size() >= limit) {
          break;
        }
        out.add(String.valueOf(s.charAt(i)));
      }
      return out;
    }
    int from = 0;
    while (true) {
      int idx = s.indexOf(sep, from);
      if (idx < 0) {
        out.add(s.substring(from));
        break;
      }
      out.add(s.substring(from, idx));
      from = idx + sep.length();
      if (limit >= 0 && out.size() >= limit) {
        return out.subList(0, limit);
      }
    }
    return out;
  }

  // =========================================================================
  // Array / string (receiver-dispatched where JS itself dispatches by type)
  // =========================================================================

  public double length(Object v) {
    if (v instanceof String) {
      return ((String) v).length();
    }
    if (v instanceof List) {
      return ((List<?>) v).size();
    }
    return 0;
  }

  public Object at(Object recv, Object indexObj) {
    int i = (int) JsNumber.jsNumber(indexObj);
    if (recv instanceof List) {
      List<?> l = (List<?>) recv;
      int idx = i < 0 ? l.size() + i : i;
      return (idx < 0 || idx >= l.size()) ? null : l.get(idx);
    }
    if (recv instanceof String) {
      String s = (String) recv;
      int idx = i < 0 ? s.length() + i : i;
      return (idx < 0 || idx >= s.length()) ? null : String.valueOf(s.charAt(idx));
    }
    return null;
  }

  public boolean includes(Object recv, Object needle) {
    if (recv instanceof List) {
      for (Object el : (List<?>) recv) {
        if (JsValue.sameValueZero(el, needle)) {
          return true;
        }
      }
      return false;
    }
    if (recv instanceof String) {
      return ((String) recv).contains(JsValue.jsString(needle));
    }
    return false;
  }

  public double index_of(Object recv, Object needle) {
    if (recv instanceof List) {
      List<?> l = (List<?>) recv;
      for (int i = 0; i < l.size(); i++) {
        if (JsValue.sameValueZero(l.get(i), needle)) {
          return i;
        }
      }
      return -1;
    }
    if (recv instanceof String) {
      return ((String) recv).indexOf(JsValue.jsString(needle));
    }
    return -1;
  }

  public double last_index_of(Object recv, Object needle) {
    if (recv instanceof List) {
      List<?> l = (List<?>) recv;
      for (int i = l.size() - 1; i >= 0; i--) {
        if (JsValue.sameValueZero(l.get(i), needle)) {
          return i;
        }
      }
      return -1;
    }
    if (recv instanceof String) {
      return ((String) recv).lastIndexOf(JsValue.jsString(needle));
    }
    return -1;
  }

  @SuppressWarnings("unchecked")
  public Object concat(Object a, Object b) {
    if (a instanceof List) {
      List<Object> out = new ArrayList<>((List<Object>) a);
      if (b instanceof List) {
        out.addAll((List<Object>) b);
      } else {
        out.add(b);
      }
      return out;
    }
    return JsValue.jsString(a) + JsValue.jsString(b);
  }

  public Object slice(Object recv, Object startObj) {
    return slice(recv, startObj, null);
  }

  public Object slice(Object recv, Object startObj, Object endObj) {
    int len = (recv instanceof String) ? ((String) recv).length()
        : (recv instanceof List) ? ((List<?>) recv).size() : 0;
    int start = clampSliceIndex(startObj == null ? 0 : (int) JsNumber.jsNumber(startObj), len);
    int end = clampSliceIndex(endObj == null ? len : (int) JsNumber.jsNumber(endObj), len);
    if (start >= end) {
      return recv instanceof String ? "" : new ArrayList<>();
    }
    if (recv instanceof String) {
      return ((String) recv).substring(start, end);
    }
    if (recv instanceof List) {
      return new ArrayList<>(((List<?>) recv).subList(start, end));
    }
    return recv;
  }

  private static int clampSliceIndex(int i, int len) {
    int v = i < 0 ? len + i : i;
    return Math.max(0, Math.min(len, v));
  }

  @SuppressWarnings("unchecked")
  public Object reverse(Object v) {
    if (v instanceof List) {
      List<Object> out = new ArrayList<>((List<Object>) v);
      java.util.Collections.reverse(out);
      return out;
    }
    if (v instanceof String) {
      return new StringBuilder((String) v).reverse().toString();
    }
    return v;
  }

  /** `.flat(depth)`; canonical `-1` is the compiled `Infinity` sentinel. */
  public List<Object> flat(Object v, Object depthObj) {
    double depth = JsNumber.jsNumber(depthObj);
    int d = depth < 0 ? Integer.MAX_VALUE : (int) depth;
    return flattenTo(v, d);
  }

  /** Dynamic `.flat(expr)` depth — JS `ToIntegerOrInfinity` coercion first (#2094). */
  public List<Object> flat_dynamic(Object v, Object depthObj) {
    double raw = JsNumber.jsNumber(depthObj);
    int d;
    if (Double.isNaN(raw)) {
      d = 0;
    } else if (raw == Double.POSITIVE_INFINITY || raw > Integer.MAX_VALUE) {
      d = Integer.MAX_VALUE;
    } else if (raw < 0) {
      d = 0;
    } else {
      d = (int) raw; // truncate toward zero
    }
    return flattenTo(v, d);
  }

  @SuppressWarnings("unchecked")
  private static List<Object> flattenTo(Object v, int depth) {
    List<Object> out = new ArrayList<>();
    if (!(v instanceof List)) {
      return out;
    }
    for (Object el : (List<Object>) v) {
      if (depth > 0 && el instanceof List) {
        out.addAll(flattenTo(el, depth - 1));
      } else {
        out.add(el);
      }
    }
    return out;
  }

  public String join(Object v) {
    return join(v, ",");
  }

  public String join(Object v, Object sep) {
    if (!(v instanceof List)) {
      return "";
    }
    String separator = JsValue.jsString(sep);
    StringBuilder sb = new StringBuilder();
    List<?> list = (List<?>) v;
    for (int i = 0; i < list.size(); i++) {
      if (i > 0) {
        sb.append(separator);
      }
      Object el = list.get(i);
      if (el != null) {
        sb.append(JsValue.jsString(el));
      }
    }
    return sb.toString();
  }

  /** `arr.filter(Boolean)` — JS truthiness, NOT PERL/Python truthiness (spec: `"0"` is truthy). */
  public List<Object> filter_truthy(Object v) {
    List<Object> out = new ArrayList<>();
    if (v instanceof List) {
      for (Object el : (List<?>) v) {
        if (JsValue.truthy(el)) {
          out.add(el);
        }
      }
    }
    return out;
  }

  // =========================================================================
  // Higher-order: canonical projection form
  // (items, field[, value]) — spec/template-helpers.md
  // =========================================================================

  @SuppressWarnings("unchecked")
  private static Object fieldOf(Object item, String field) {
    if (item instanceof Map) {
      return ((Map<String, Object>) item).get(field);
    }
    return null;
  }

  public boolean every(Object recv, Object field) {
    if (!(recv instanceof List)) {
      return true;
    }
    String f = JsValue.jsString(field);
    for (Object item : (List<?>) recv) {
      if (!JsValue.truthy(fieldOf(item, f))) {
        return false;
      }
    }
    return true;
  }

  public boolean some(Object recv, Object field) {
    if (!(recv instanceof List)) {
      return false;
    }
    String f = JsValue.jsString(field);
    for (Object item : (List<?>) recv) {
      if (JsValue.truthy(fieldOf(item, f))) {
        return true;
      }
    }
    return false;
  }

  public List<Object> filter(Object recv, Object field, Object value) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    String f = JsValue.jsString(field);
    for (Object item : (List<?>) recv) {
      if (JsValue.sameValueZero(fieldOf(item, f), value)) {
        out.add(item);
      }
    }
    return out;
  }

  public Object find(Object recv, Object field, Object value) {
    if (!(recv instanceof List)) {
      return null;
    }
    String f = JsValue.jsString(field);
    for (Object item : (List<?>) recv) {
      if (JsValue.sameValueZero(fieldOf(item, f), value)) {
        return item;
      }
    }
    return null;
  }

  public double find_index(Object recv, Object field, Object value) {
    if (!(recv instanceof List)) {
      return -1;
    }
    String f = JsValue.jsString(field);
    List<?> list = (List<?>) recv;
    for (int i = 0; i < list.size(); i++) {
      if (JsValue.sameValueZero(fieldOf(list.get(i), f), value)) {
        return i;
      }
    }
    return -1;
  }

  public Object find_last(Object recv, Object field, Object value) {
    if (!(recv instanceof List)) {
      return null;
    }
    String f = JsValue.jsString(field);
    List<?> list = (List<?>) recv;
    for (int i = list.size() - 1; i >= 0; i--) {
      if (JsValue.sameValueZero(fieldOf(list.get(i), f), value)) {
        return list.get(i);
      }
    }
    return null;
  }

  public double find_last_index(Object recv, Object field, Object value) {
    if (!(recv instanceof List)) {
      return -1;
    }
    String f = JsValue.jsString(field);
    List<?> list = (List<?>) recv;
    for (int i = list.size() - 1; i >= 0; i--) {
      if (JsValue.sameValueZero(fieldOf(list.get(i), f), value)) {
        return i;
      }
    }
    return -1;
  }

  // =========================================================================
  // sort / reduce / flat_map — structured (non-lambda) descriptors
  // =========================================================================

  /**
   * `.sort(cmp)` / `.toSorted(cmp)` for the accepted comparator catalogue.
   * `opts` is `{"keys": [{"key_kind": "self"|"field", "key": <field>?,
   * "compare_type": "numeric"|"string"|"auto", "direction": "asc"|"desc"}, ...]}`
   * — non-mutating, stable.
   */
  @SuppressWarnings("unchecked")
  public List<Object> sort(Object recv, Object optsObj) {
    if (!(recv instanceof List)) {
      return new ArrayList<>();
    }
    List<Object> out = new ArrayList<>((List<Object>) recv);
    Map<String, Object> opts = (Map<String, Object>) optsObj;
    List<Object> keys = (List<Object>) opts.get("keys");
    Comparator<Object> cmp = (a, b) -> {
      for (Object keyObj : keys) {
        Map<String, Object> key = (Map<String, Object>) keyObj;
        String keyKind = JsValue.jsString(key.get("key_kind"));
        Object av = keyKind.equals("self") ? a : fieldOf(a, JsValue.jsString(key.get("key")));
        Object bv = keyKind.equals("self") ? b : fieldOf(b, JsValue.jsString(key.get("key")));
        String compareType = JsValue.jsString(key.get("compare_type"));
        String direction = JsValue.jsString(key.get("direction"));
        int c = compareValues(av, bv, compareType);
        if (direction.equals("desc")) {
          c = -c;
        }
        if (c != 0) {
          return c;
        }
      }
      return 0;
    };
    out.sort(cmp);
    return out;
  }

  private static int compareValues(Object a, Object b, String compareType) {
    if (compareType.equals("numeric")) {
      return Double.compare(JsNumber.jsNumber(a), JsNumber.jsNumber(b));
    }
    if (compareType.equals("string")) {
      // `localeCompare` (ICU collation, e.g. "a" before "B") — Java's
      // Collator with PRIMARY strength approximates this ordering closely
      // enough for the ASCII-domain vectors; exact ICU collation is a
      // known cross-host variance point (spec/template-helpers.md's
      // `sort` entry).
      java.text.Collator collator = java.text.Collator.getInstance(java.util.Locale.US);
      return collator.compare(JsValue.jsString(a), JsValue.jsString(b));
    }
    // "auto": relational operator — numeric for numbers, lexical for strings
    // (including numeric-looking strings, e.g. "10" < "9").
    if (a instanceof Number && b instanceof Number) {
      return Double.compare(((Number) a).doubleValue(), ((Number) b).doubleValue());
    }
    return JsValue.jsString(a).compareTo(JsValue.jsString(b));
  }

  /**
   * `.reduce((acc, x) => acc <op> x[.field], init)` / `.reduceRight(...)`.
   * `op` in {"+","*"}; `keyKind` in {"self","field"}; `type` in
   * {"numeric","string"}; `init` as a string (decoded seed); `direction`
   * in {"left","right"}.
   */
  public Object reduce(Object recv, Object op, Object keyKind, Object key, Object type,
                        Object init, Object direction) {
    List<?> list = recv instanceof List ? (List<?>) recv : List.of();
    boolean isMul = "*".equals(op);
    boolean isSelf = "self".equals(keyKind);
    boolean rightward = "right".equals(direction);
    // The declared `type` decodes the INITIAL seed literal only (a numeric
    // seed like "0" vs a string seed like ""). Folding itself always
    // applies GENUINE JS `+` semantics from there — a numeric accumulator
    // that meets a string-typed item concatenates from that point on, same
    // as real JS `0 + "5" + "6"` -> "056" even though the seed's declared
    // type is numeric (spec/template-helpers.md's `reduce` entry, the
    // "numeric-string items concatenate" vector: `type` does NOT force
    // numeric coercion of every subsequent element).
    Object acc = "numeric".equals(type) ? (Object) JsNumber.jsNumber(JsValue.jsString(init)) : JsValue.jsString(init);
    int n = list.size();
    for (int i = 0; i < n; i++) {
      Object item = list.get(rightward ? n - 1 - i : i);
      Object v = isSelf ? item : fieldOf(item, JsValue.jsString(key));
      if (isMul) {
        acc = JsNumber.jsNumber(acc) * JsNumber.jsNumber(v);
      } else if (acc instanceof String || v instanceof String) {
        // Direction changes ITERATION ORDER only (which item is visited
        // first) — the fold expression itself is always `acc + x`, never
        // swapped, exactly like real JS `.reduceRight((acc, x) => acc + x)`.
        acc = JsValue.jsString(acc) + JsValue.jsString(v);
      } else {
        acc = JsNumber.jsNumber(acc) + JsNumber.jsNumber(v);
      }
    }
    return acc;
  }

  public List<Object> flat_map(Object recv, Object kind, Object name) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    boolean isSelf = "self".equals(kind);
    for (Object item : (List<?>) recv) {
      Object v = isSelf ? item : fieldOf(item, JsValue.jsString(name));
      if (v instanceof List) {
        out.addAll((List<?>) v);
      } else {
        out.add(v);
      }
    }
    return out;
  }

  /**
   * Tuple form: `i => [i.a, i.b]` — every leaf appended verbatim (only the
   * literal wrapper flattens). `kindNamePairsArg` is a single Pebble LIST
   * literal (`[kind0, name0, kind1, name1, ...]`), not a Java varargs
   * parameter — see `merge`'s doc comment for why (Pebble's method
   * resolver can't match a varargs method call).
   */
  public List<Object> flat_map_tuple(Object recv, Object kindNamePairsArg) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    List<?> kindNamePairs = kindNamePairsArg instanceof List ? (List<?>) kindNamePairsArg : List.of();
    for (Object item : (List<?>) recv) {
      for (int i = 0; i + 1 < kindNamePairs.size(); i += 2) {
        boolean isSelf = "self".equals(kindNamePairs.get(i));
        Object v = isSelf ? item : fieldOf(item, JsValue.jsString(kindNamePairs.get(i + 1)));
        out.add(v);
      }
    }
    return out;
  }

  // =========================================================================
  // search_params_get / query
  // =========================================================================

  public Object search_params_get(Object queryStr, Object key) {
    String q = JsValue.jsString(queryStr);
    if (q.startsWith("?")) {
      q = q.substring(1);
    }
    String wantKey = JsValue.jsString(key);
    if (q.isEmpty()) {
      return null;
    }
    for (String pair : q.split("&", -1)) {
      int eq = pair.indexOf('=');
      String k = eq < 0 ? pair : pair.substring(0, eq);
      String v = eq < 0 ? "" : pair.substring(eq + 1);
      k = urlDecode(k);
      if (k.equals(wantKey)) {
        return urlDecode(v);
      }
    }
    return null;
  }

  private static String urlDecode(String s) {
    return URLDecoder.decode(s, StandardCharsets.UTF_8);
  }

  /**
   * `queryHref` builtin lowering target (#2042): `base` + an ORDERED LIST
   * of `(included, key, value)` triples flattened into one Pebble
   * LIST-literal argument (`bf.query(base, [included0, key0, value0, ...])`)
   * — NOT a Java varargs parameter; see `merge`'s doc comment for why
   * (Pebble's method resolver can't match a varargs method call). `value`
   * is a scalar or a list (one pair per member), form-encoded like
   * `URLSearchParams` (space -> `+`, `~` kept literally UNescaped is WRONG
   * — see vectors: `~` encodes to `%7E`, `*` stays literal). Repeated key:
   * last WRITE wins, first POSITION kept (a JS `URLSearchParams.set`
   * semantics fold).
   */
  public String query(Object base, Object triplesArg) {
    List<?> triples = triplesArg instanceof List ? (List<?>) triplesArg : List.of();
    // key -> (position, values[])
    Map<String, Integer> position = new LinkedHashMap<>();
    List<List<String>> valuesByPosition = new ArrayList<>();
    int nextPos = 0;
    for (int i = 0; i + 3 <= triples.size(); i += 3) { // a trailing partial triple is simply never reached
      boolean included = JsValue.truthy(triples.get(i));
      String key = JsValue.jsString(triples.get(i + 1));
      Object valueObj = triples.get(i + 2);
      List<String> values = new ArrayList<>();
      if (valueObj instanceof List) {
        for (Object el : (List<?>) valueObj) {
          String s = JsValue.jsString(el);
          if (!s.isEmpty()) {
            values.add(s);
          }
        }
      } else {
        String s = JsValue.jsString(valueObj);
        if (!s.isEmpty()) {
          values.add(s);
        }
      }
      if (!included || values.isEmpty()) {
        continue;
      }
      Integer pos = position.get(key);
      if (pos == null) {
        pos = nextPos++;
        position.put(key, pos);
        valuesByPosition.add(null);
      }
      // Build/overwrite the (key, values) pair at its position, keeping the
      // ORIGINAL key text for encoding.
      List<String> entry = new ArrayList<>();
      entry.add(key);
      entry.addAll(values);
      while (valuesByPosition.size() <= pos) {
        valuesByPosition.add(null);
      }
      valuesByPosition.set(pos, entry);
    }
    StringBuilder qs = new StringBuilder();
    for (List<String> entry : valuesByPosition) {
      if (entry == null) {
        continue;
      }
      String key = entry.get(0);
      for (int i = 1; i < entry.size(); i++) {
        if (qs.length() > 0) {
          qs.append('&');
        }
        qs.append(formEncode(key)).append('=').append(formEncode(entry.get(i)));
      }
    }
    String baseStr = JsValue.jsString(base);
    return qs.length() == 0 ? baseStr : baseStr + "?" + qs;
  }

  /** `application/x-www-form-urlencoded` (URLSearchParams), not RFC 3986 query-escape: space -> `+`, `~`/`*` differ from percent-escaping. */
  private static String formEncode(String s) {
    String encoded = URLEncoder.encode(s, StandardCharsets.UTF_8);
    // Java's URLEncoder escapes '*' (as %2A) and encodes space as '+'
    // already; JS's URLSearchParams leaves '*' literal and escapes '~' (Java
    // leaves '~' literal) — reconcile both differences explicitly.
    return encoded.replace("%2A", "*").replace("~", "%7E");
  }

  // =========================================================================
  // Style / spread attribute rendering (#1322/#2261)
  // =========================================================================

  /**
   * Mirrors Hono's own CSS-injection guard (`hono/jsx/utils.ts`'s
   * `hasUnsafeStyleValue` — the ORACLE a dynamic `style={{...}}` value
   * must match, #2261; shared reference port at
   * `packages/jsx/src/expression-parser.ts`'s `hasUnsafeStyleValue`) — a
   * hand-rolled structural scan for characters that could break out of a
   * CSS declaration, NOT real CSSOM property validation. Ported
   * character-for-character (UTF-16 code-unit comparisons, matching the
   * JS reference's `charCodeAt` scan — every tested character is ASCII,
   * so this agrees with a codepoint or byte scan too), NOT the ad-hoc
   * regex this method previously used (`[;{}]|/\*|<|>|url\(`) — that
   * regex was a rough approximation, not a faithful port: notably it
   * FLAGGED AN EMPTY STRING AS SAFE-BUT-DROPPED via a separate
   * `value.isEmpty()` check `style_object` used to short-circuit on,
   * which diverges from the reference (an empty value is safe and MUST
   * be KEPT, producing `key:;` — confirmed via the data-point conformance
   * oracle, `style-object-dynamic`'s `gen:color:empty` point). Mirrors
   * the Python port's `_has_unsafe_style_value` line-for-line.
   */
  private static boolean hasUnsafeStyleValue(String value) {
    char quote = 0;
    java.util.Deque<Character> blockStack = new java.util.ArrayDeque<>();
    int len = value.length();
    for (int i = 0; i < len; i++) {
      char c = value.charAt(i);
      if (c == '\\') {
        if (i == len - 1) {
          return true;
        }
        i++;
      } else if (quote != 0) {
        if (c == '\n' || c == '\f' || c == '\r') {
          return true;
        }
        if (c == quote) {
          quote = 0;
        }
      } else if (c == '/' && i + 1 < len && value.charAt(i + 1) == '*') {
        int end = value.indexOf("*/", i + 2);
        if (end == -1) {
          return true;
        }
        i = end + 1;
      } else if (c == '"' || c == '\'') {
        quote = c;
      } else if (c == '(') {
        blockStack.push(')');
      } else if (c == '[') {
        blockStack.push(']');
      } else if (c == '{' || c == '}') {
        return true;
      } else if (c == ')' || c == ']') {
        if (blockStack.isEmpty() || blockStack.peek() != c) {
          return true;
        }
        blockStack.pop();
      } else if (c == ';' && blockStack.isEmpty()) {
        return true;
      }
    }
    return quote != 0 || !blockStack.isEmpty();
  }

  /**
   * `style={{...}}` object literal lowering (Hono's `hasUnsafeStyleValue`
   * oracle, ported, matching the Python runtime's `style_object` exactly —
   * see its own doc comment): a single Pebble LIST-literal argument
   * flattening `(cssKey, value)` pairs (`bf.style_object([cssKey0,
   * value0, ...])`) — NOT a Java varargs parameter; see `merge`'s doc
   * comment for why (Pebble's method resolver can't match a varargs
   * method call). Drops any pair whose value could break out of the CSS
   * declaration; HTML-escapes what remains; joins with a bare `;`
   * (`packages/adapter-pebble/src/adapter/pebble-adapter.ts`'s
   * `tryLowerStyleObject` caller wraps the RESULT in `style="..."` itself
   * — this method returns only the declaration list, never the
   * `style="..."` wrapper). Returns a {@link SafeString} so the caller's
   * un-filtered `{{ bf.style_object(...) }}` isn't double-HTML-escaped by
   * Pebble's own autoescaper (see the source-code note in the package
   * README on `SafeString`/`EscapeFilter`) — the join already applied
   * `htmlEscape` once, matching Hono's own `escapeToBuffer` call on its
   * accumulated style string (a "safe" CSS value can still carry a
   * literal `"`/`'`/`&`, e.g. a balanced-quote string value, that would
   * otherwise break out of the double-quoted `style="..."` attribute).
   */
  public SafeString style_object(Object keyValuePairsArg) {
    List<?> keyValuePairs = keyValuePairsArg instanceof List ? (List<?>) keyValuePairsArg : List.of();
    List<String> parts = new ArrayList<>();
    for (int i = 0; i + 1 < keyValuePairs.size(); i += 2) {
      String cssKey = JsValue.jsString(keyValuePairs.get(i));
      Object valueObj = keyValuePairs.get(i + 1);
      if (valueObj == null) {
        continue;
      }
      String value = JsValue.jsString(valueObj);
      if (hasUnsafeStyleValue(value)) {
        continue;
      }
      parts.add(htmlEscape(cssKey) + ":" + htmlEscape(value));
    }
    return new SafeString(String.join(";", parts));
  }

  /** `{...attrs}` spread onto an intrinsic element — one `key="value"` per entry, boolean-shorthand aware. */
  @SuppressWarnings("unchecked")
  public SafeString spread_attrs(Object attrsObj) {
    StringBuilder out = new StringBuilder();
    if (attrsObj instanceof Map) {
      for (Map.Entry<String, Object> e : ((Map<String, Object>) attrsObj).entrySet()) {
        Object v = e.getValue();
        if (v == null || Boolean.FALSE.equals(v)) {
          continue;
        }
        if (out.length() > 0) {
          out.append(' ');
        }
        if (Boolean.TRUE.equals(v)) {
          out.append(htmlEscape(e.getKey()));
        } else {
          out.append(htmlEscape(e.getKey())).append("=\"").append(htmlEscape(JsValue.jsString(v))).append('"');
        }
      }
    }
    return new SafeString(out.toString());
  }

  private static String htmlEscape(String s) {
    StringBuilder sb = new StringBuilder(s.length());
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '&':
          sb.append("&amp;");
          break;
        case '<':
          sb.append("&lt;");
          break;
        case '>':
          sb.append("&gt;");
          break;
        case '"':
          sb.append("&quot;");
          break;
        case '\'':
          sb.append("&#39;");
          break;
        default:
          sb.append(c);
      }
    }
    return sb.toString();
  }

  // =========================================================================
  // Hydration markers / render state
  // (spec/template-helpers.md explicitly excludes these — see the class
  // header. Phase 4 validates the exact byte shape against the shared
  // fixture corpus; this is a reasonable, self-consistent implementation.)
  // =========================================================================

  /** `bf-s="..."` value: this scope's own id. */
  public String scope_attr() {
    return rootScopeId;
  }

  /**
   * `bf-h="<host>" bf-m="<slot>" bf-r=""` conditionally — see
   * `spec/compiler.md` "Slot identity" and `packages/shared/src/markers.ts`.
   * Mirrors the Jinja/Rust ports' `hydration_attrs` byte-for-byte.
   */
  public String hydration_attrs() {
    List<String> parts = new ArrayList<>();
    if (bfHost != null) {
      parts.add("bf-h=\"" + htmlEscape(bfHost) + "\"");
    }
    if (bfMount != null) {
      parts.add("bf-m=\"" + htmlEscape(bfMount) + "\"");
    }
    if (!isChild) {
      parts.add("bf-r=\"\"");
    }
    return String.join(" ", parts);
  }

  /** `bf-p='...'` hydration-props payload, when one accompanies this scope. */
  @SuppressWarnings("unchecked")
  public String props_attr() {
    if (!(markerProps instanceof Map) || ((Map<String, Object>) markerProps).isEmpty()) {
      return "";
    }
    // Attribute-escaped, not just HTML-escaped: a raw `'` inside a string
    // value (e.g. a blog paragraph) would terminate the single-quoted
    // attribute and truncate the hydration payload — the browser
    // entity-decodes the attribute value, so the client's JSON.parse still
    // sees the original text.
    return " bf-p='" + htmlEscape(json(markerProps)) + "'";
  }

  /** A loop row's own data-key attribute, when this component is itself invoked as a keyed row. */
  public String data_key_attr() {
    if (dataKey == null) {
      return "";
    }
    String k = JsValue.jsString(dataKey).replace("&", "&amp;").replace("\"", "&quot;");
    return " data-key=\"" + k + "\"";
  }

  /** HTML comment marker (`<!--bf-...-->`) — every marker id `pebble-adapter.ts` passes here already carries its own semantic prefix (`loop:`, `cond-start:`, …); this method supplies only the shared `bf-` wire prefix (`packages/shared/src/markers.ts`). */
  public String comment(Object text) {
    return "<!--bf-" + JsValue.jsString(text) + "-->";
  }

  /** Neutralizes `-` in a dynamic loop-row key so it can't spell `-->` and close the comment early. */
  /**
   * Neutralizes `-` in a dynamic loop-row key so it can't spell `-->` and
   * close the comment early (#2795 follow-up). Replaces with U+2010
   * (HYPHEN, visually near-identical to ASCII `-`) — matches the Python/
   * Rust ports' `escape_comment_key` exactly, NOT an underscore: the key's
   * exact text doesn't need to round-trip (the client's `mapArrayAnchored`
   * matches items positionally and by its own JS-computed key, never by
   * re-parsing the anchor comment's text), so the substitution only needs
   * to be visually close and never decoded back.
   */
  public String escape_comment_key(Object key) {
    return JsValue.jsString(key).replace("-", "‐");
  }

  /** See `spec/compiler.md` "Slot identity" for the comment-scope wire format. Mirrors the Jinja/Rust ports' `scope_comment` byte-for-byte. */
  @SuppressWarnings("unchecked")
  public String scope_comment() {
    String hostSegment = "";
    if (bfHost != null) {
      hostSegment = "|h=" + bfHost + "|m=" + (bfMount == null ? "" : bfMount);
    }
    String propsJson = "";
    if (markerProps instanceof Map && !((Map<String, Object>) markerProps).isEmpty()) {
      propsJson = "|" + json(markerProps);
    }
    return "<!--bf-scope:" + rootScopeId + hostSegment + propsJson + "-->";
  }

  /** Paired end marker for `scope_comment` — no host/props segments, the client only needs the scope id to close the boundary (#2289). */
  public String scope_comment_end() {
    return "<!--bf-/scope:" + rootScopeId + "-->";
  }

  /** `<div bf-async="id">fallback</div>` wrapper — a real render always resolves synchronously, so this only wraps the fallback markup for the marker's sake. */
  public String async_boundary(Object id, Object fallbackHtml) {
    return "<div bf-async=\"" + htmlEscape(JsValue.jsString(id)) + "\">" + JsValue.jsString(fallbackHtml) + "</div>";
  }

  /** Text-slot hydration anchor. Mirrors the Jinja/Rust ports' `text_start` byte-for-byte (`<!--bf:<slot>-->`, NOT this class's own `comment()` wire shape — the client's text-patch walker matches this exact prefix, see `packages/client/src/runtime`). */
  public String text_start(Object slotId) {
    return "<!--bf:" + JsValue.jsString(slotId) + "-->";
  }

  public String text_end() {
    return "<!--/-->";
  }

  public String register_script(Object url) {
    String path = JsValue.jsString(url);
    // Synchronized on `scripts` (see that field's doc comment — the shared
    // monitor for the whole scripts/scriptSeen/preloads/preloadSeen bundle):
    // `newRoot` makes these reachable from genuinely independent top-level
    // island renders, not just a single-threaded `render_child` recursion,
    // so the check-then-add here must be atomic against a concurrent
    // `register_script`/`register_preload` call from a sibling island.
    synchronized (scripts) {
      if (scriptSeen.add(path)) {
        scripts.add(path);
      }
    }
    return "<script type=\"module\" src=\"" + htmlEscape(path) + "\"></script>";
  }

  public String register_preload(Object url) {
    String path = JsValue.jsString(url);
    synchronized (scripts) {
      if (preloadSeen.add(path)) {
        preloads.add(path);
      }
    }
    return "<link rel=\"modulepreload\" href=\"" + htmlEscape(path) + "\">";
  }

  /**
   * Read back the FULL accumulated `<link rel="modulepreload">` +
   * `<script type="module">` tag list for this render tree — callable on
   * ANY `Bf` instance in the tree (root or a `render_child` descendant),
   * since {@link #scripts}/{@link #preloads} are shared references, but
   * intended to be called on the ROOT instance after
   * `template.evaluate(...)` returns (mirrors Rust's `BfInstance::scripts()`
   * and every `render.rs`-shaped integration's `scripts_html()` helper —
   * see `integrations/spring`'s `Render` class). Preload hints are emitted
   * FIRST, ahead of every script tag — a hint that arrives after the script
   * it describes is useless; registration order is otherwise preserved.
   */
  public String scripts() {
    StringBuilder sb = new StringBuilder();
    synchronized (scripts) {
      for (String p : preloads) {
        if (sb.length() > 0) {
          sb.append('\n');
        }
        sb.append("<link rel=\"modulepreload\" href=\"").append(htmlEscape(p)).append("\">");
      }
      for (String p : scripts) {
        if (sb.length() > 0) {
          sb.append('\n');
        }
        sb.append("<script type=\"module\" src=\"").append(htmlEscape(p)).append("\"></script>");
      }
    }
    return sb.toString();
  }

  /**
   * Collects an {@code ssrPortalOwnerScope}-flagged element's already-
   * rendered, fully-evaluated markup so it can be emitted at the
   * {@link #portals()} outlet near {@code </body>} instead of at its
   * source position (#3119). {@code content} already carries its own
   * {@code bf-po} attribute (stamped directly on its own tag by the
   * compiler, matching exactly what the client
   * {@code createPortal(el, document.body, { ownerScope })} stamps onto
   * the SAME element at hydrate time), so unlike a hypothetical "wrap
   * arbitrary children" collector this appends {@code content} UNWRAPPED —
   * no extra {@code bf-pi}/{@code bf-po} container element, which would
   * diverge from what the client stamps directly onto the element itself.
   * Returns {@code ""} — every call site discards the return value (the
   * compiled `.peb` template's own {@code {% set _bf_poN = ... %}}
   * pattern, mirroring {@link #register_script}), so nothing prints at
   * the source position.
   */
  public String register_portal_element(Object content) {
    String html = content == null ? "" : content.toString();
    synchronized (scripts) {
      portalElements.add(html);
    }
    return "";
  }

  /**
   * Emits every collected SSR-portal element, in registration order. Place
   * {@code {{ bf.portals() | raw }}} once near {@code </body>} in the
   * app's own layout — mirrors {@link #scripts()} above (same "collect
   * during render, emit at a single outlet" shape) and the Hono reference
   * adapter's {@code <BfPortals />}.
   */
  public String portals() {
    StringBuilder sb = new StringBuilder();
    synchronized (scripts) {
      for (String p : portalElements) {
        if (sb.length() > 0) {
          sb.append('\n');
        }
        sb.append(p);
      }
    }
    return sb.toString();
  }

  // Context provide/use — a simple stack per context name, SHARED across
  // this whole render tree (see the `contextStacks` field doc comment).

  public String provide_context(Object name, Object value) {
    contextStacks.computeIfAbsent(JsValue.jsString(name), k -> new java.util.ArrayDeque<>()).push(value);
    return "";
  }

  public String revoke_context(Object name) {
    java.util.Deque<Object> stack = contextStacks.get(JsValue.jsString(name));
    if (stack != null && !stack.isEmpty()) {
      stack.pop();
    }
    return "";
  }

  /** Zero-arg form — no default (a `useContext(Ctx)` call whose context has a resolvable static default already folds that default in at the TS emission layer, so this overload is a defensive fallback, not the common path). */
  public Object use_context(Object name) {
    return use_context(name, null);
  }

  /** `bf.use_context(name, defaultValue)` — `memo/seed.ts`'s `generateContextConsumerSeed` always emits the 2-arg form (`contextDefaultPebble`'s static default, or the createContext(...) call's own default). */
  public Object use_context(Object name, Object defaultValue) {
    java.util.Deque<Object> stack = contextStacks.get(JsValue.jsString(name));
    return (stack == null || stack.isEmpty()) ? defaultValue : stack.peek();
  }

  /**
   * Cross-template child invocation (`<Child {...props}/>`), Phase 4
   * (#2101). `pebble-adapter.ts`'s `renderComponent` emits this as
   * `bf.render_child('<snake_case_name>', {'k': v, ...})` — a SINGLE
   * Pebble map-literal argument (Pebble has no keyword-splat call syntax) —
   * or the no-props form `bf.render_child('<name>')`. Mirrors the
   * production Python runtime's `render_child`/`make_renderer`
   * (`packages/adapter-jinja/python/barefootjs/runtime.py`) and the
   * structurally-closest Rust port's `BfInstance::render_child`
   * (`packages/adapter-rust/runtime/src/runtime.rs`):
   *
   * <ol>
   *   <li>Every incoming prop key is mangled via {@link PebbleIdent} —
   *       the child template's own body references each prop through the
   *       IDENTICAL mangling (`pebbleIdent(name)` at the TS emission
   *       layer), so the context-map key built here must match exactly.
   *   <li>A declared `...rest` bag (per {@link ChildMeta#restPropsName})
   *       collects every prop the child's OWN param list doesn't declare.
   *   <li>`_bf_slot` (slot-attached child: `child_scope = host_scope +
   *       "_" + slot`, `bf-h`/`bf-m` set) vs. no slot (loop-item / bare
   *       invocation: a fresh `<ComponentName>_<rand6>` scope id, no
   *       `bf-h`/`bf-m`) — see `spec/compiler.md` "Slot identity".
   *   <li>`key` becomes the child's `data_key_attr()`.
   *   <li>{@link DeriveStashFromDefaults} resolves the child's own
   *       SSR-default fallbacks against the caller's ACTUAL props (caller
   *       wins for a non-null value) — the `extractSsrDefaults`/
   *       `deriveStashFromDefaults` contract (`packages/jsx/src/
   *       ssr-defaults.ts`) every other adapter's `render_child` already
   *       honors.
   * </ol>
   *
   * The child gets its own fresh {@link Bf} instance (its own scope id /
   * host / mount / data-key) evaluating the NAMED child template via this
   * instance's shared {@link PebbleEngine} — {@code FileLoader} resolves
   * any sibling `.peb` file by name directly, so no explicit per-child
   * "registration" step is needed the way the Python/Rust ports require.
   */
  public String render_child(Object name) {
    return render_child(name, Map.of());
  }

  @SuppressWarnings("unchecked")
  public String render_child(Object name, Object propsObj) {
    String tplName = JsValue.jsString(name);
    if (engine == null) {
      throw new IllegalStateException(
          "bf.render_child('" + tplName + "', ...): this Bf instance has no PebbleEngine wired in "
              + "(construct it via `new Bf(rootScopeId, engine, manifest)` — see Main.render).");
    }
    Map<String, Object> raw = propsObj instanceof Map ? (Map<String, Object>) propsObj : Map.of();

    // Mangle every incoming key up front (matches the child template's own
    // pebbleIdent-mangled bare-identifier references) before any special
    // key (`_bf_slot`/`key`/rest-bag name) is popped by its own name below —
    // none of those three is itself a Pebble/Java reserved word, so mangling
    // order has no observable effect on them, but doing it first keeps this
    // method's key space consistent throughout (mirrors the Rust port).
    Map<String, Object> props = new LinkedHashMap<>();
    for (Map.Entry<String, Object> e : raw.entrySet()) {
      props.put(PebbleIdent.mangle(e.getKey()), e.getValue());
    }

    ChildMeta meta = manifest.get(tplName);

    // Rest-bag routing: every prop the child does NOT declare is folded
    // into its own `...rest` bag (mirrors adapter-rust's `render_child`).
    if (meta != null && meta.restPropsName != null) {
      String restKey = PebbleIdent.mangle(meta.restPropsName);
      Set<String> keep = new HashSet<>();
      for (String p : meta.paramNames) {
        keep.add(PebbleIdent.mangle(p));
      }
      keep.add(restKey);
      keep.add("children");
      keep.add(PebbleIdent.mangle("key"));
      keep.add("_bf_slot");

      Map<String, Object> restBag = new LinkedHashMap<>();
      Object existingRest = props.remove(restKey);
      if (existingRest instanceof Map) {
        restBag.putAll((Map<String, Object>) existingRest);
      }
      for (String k : new ArrayList<>(props.keySet())) {
        if (!keep.contains(k)) {
          restBag.put(k, props.remove(k));
        }
      }
      props.put(restKey, restBag);
    }

    Object slotIdObj = props.remove("_bf_slot");
    String slotId = slotIdObj == null ? null : JsValue.jsString(slotIdObj);
    Object dataKeyValue = props.remove(PebbleIdent.mangle("key"));

    String hostScope = this.rootScopeId;
    String childScopeId;
    String childBfHost = null;
    String childBfMount = null;
    if (slotId != null && !slotId.isEmpty()) {
      childScopeId = hostScope + "_" + slotId;
      childBfHost = hostScope;
      childBfMount = slotId;
    } else {
      // Loop-item / bare invocation: a fresh `<ComponentName>_<rand6>` id —
      // mirrors Hono's own `${name}_${Math.random().toString(36).slice(2, 8)}`
      // root-scope-id fallback for a component rendered with no
      // `__instanceId`. `meta.componentName` is the ORIGINAL PascalCase
      // name (not the snake_case template file basename) — see ChildMeta.
      String prefix = meta != null ? meta.componentName : tplName;
      childScopeId = prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 6);
    }

    Bf child = new Bf(
        childScopeId, engine, manifest, true, childBfHost, childBfMount, dataKeyValue, null,
        contextStacks, scripts, scriptSeen, preloads, preloadSeen, portalElements);

    Map<String, Object> vars = new LinkedHashMap<>(props);
    if (meta != null) {
      vars.putAll(DeriveStashFromDefaults.derive(meta.ssrDefaults, props));
    }

    PebbleTemplate template = engine.getTemplate(tplName);
    Map<String, Object> context = new LinkedHashMap<>(vars);
    context.put("bf", child);
    StringWriter writer = new StringWriter();
    try {
      template.evaluate(writer, context);
    } catch (IOException e) {
      throw new RuntimeException("bf.render_child('" + tplName + "', ...) failed", e);
    }
    String rendered = writer.toString();
    // chomp: remove at most one trailing newline — every sibling-language
    // render_child does this (the generated template always ends with a
    // trailing `\n` the caller doesn't want re-introduced mid-page).
    return rendered.endsWith("\n") ? rendered.substring(0, rendered.length() - 1) : rendered;
  }

  // =========================================================================
  // ParsedExpr evaluator (#2018) — `.map()/.filter()/.reduce()/.sort()/
  // .find()` callback bodies that don't lower to native Pebble syntax.
  // Each `*_eval` method receives the callback body as serialized-JSON
  // (see packages/adapter-pebble/src/adapter/expr/array-method.ts's
  // render*Eval functions for the exact call shape) plus the captured
  // free-variable environment as a Pebble map literal.
  // =========================================================================

  private static JsonObject parseNode(String json) {
    return GSON.fromJson(json, JsonObject.class);
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> baseEnv(Object envMap) {
    return envMap instanceof Map ? new LinkedHashMap<>((Map<String, Object>) envMap) : new LinkedHashMap<>();
  }

  public List<Object> map_eval(Object recv, String bodyJson, String param, Object env) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    List<?> list = (List<?>) recv;
    for (Object item : list) {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      out.add(Evaluator.evaluate(body, inner));
    }
    return out;
  }

  public List<Object> filter_eval(Object recv, String bodyJson, String param, Object env) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    for (Object item : (List<?>) recv) {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      if (JsValue.truthy(Evaluator.evaluate(body, inner))) {
        out.add(item);
      }
    }
    return out;
  }

  public boolean every_eval(Object recv, String bodyJson, String param, Object env) {
    if (!(recv instanceof List)) {
      return true;
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    for (Object item : (List<?>) recv) {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      if (!JsValue.truthy(Evaluator.evaluate(body, inner))) {
        return false;
      }
    }
    return true;
  }

  public boolean some_eval(Object recv, String bodyJson, String param, Object env) {
    if (!(recv instanceof List)) {
      return false;
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    for (Object item : (List<?>) recv) {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      if (JsValue.truthy(Evaluator.evaluate(body, inner))) {
        return true;
      }
    }
    return false;
  }

  public Object find_eval(Object recv, String bodyJson, String param, Object forwardObj, Object env) {
    if (!(recv instanceof List)) {
      return null;
    }
    boolean forward = JsValue.truthy(forwardObj);
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    List<?> list = (List<?>) recv;
    int n = list.size();
    for (int i = 0; i < n; i++) {
      Object item = list.get(forward ? i : n - 1 - i);
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      if (JsValue.truthy(Evaluator.evaluate(body, inner))) {
        return item;
      }
    }
    return null;
  }

  public double find_index_eval(Object recv, String bodyJson, String param, Object forwardObj, Object env) {
    if (!(recv instanceof List)) {
      return -1;
    }
    boolean forward = JsValue.truthy(forwardObj);
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    List<?> list = (List<?>) recv;
    int n = list.size();
    for (int i = 0; i < n; i++) {
      int idx = forward ? i : n - 1 - i;
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, list.get(idx));
      if (JsValue.truthy(Evaluator.evaluate(body, inner))) {
        return idx;
      }
    }
    return -1;
  }

  public List<Object> flat_map_eval(Object recv, String bodyJson, String param, Object env) {
    List<Object> out = new ArrayList<>();
    if (!(recv instanceof List)) {
      return out;
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    for (Object item : (List<?>) recv) {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(param, item);
      Object v = Evaluator.evaluate(body, inner);
      if (v instanceof List) {
        out.addAll((List<?>) v);
      } else {
        out.add(v);
      }
    }
    return out;
  }

  public List<Object> sort_eval(Object recv, String bodyJson, String paramA, String paramB, Object env) {
    if (!(recv instanceof List)) {
      return new ArrayList<>();
    }
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    List<Object> out = new ArrayList<>();
    for (Object o : (List<?>) recv) {
      out.add(o);
    }
    out.sort((a, b) -> {
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(paramA, a);
      inner.put(paramB, b);
      double r = JsNumber.jsNumber(Evaluator.evaluate(body, inner));
      return Double.compare(r, 0.0);
    });
    return out;
  }

  public Object reduce_eval(Object recv, String bodyJson, String paramAcc, String paramItem,
                             Object init, String direction, Object env) {
    JsonObject body = parseNode(bodyJson);
    Map<String, Object> base = baseEnv(env);
    List<?> list = recv instanceof List ? (List<?>) recv : List.of();
    boolean rightward = "right".equals(direction);
    Object acc = init;
    int n = list.size();
    for (int i = 0; i < n; i++) {
      Object item = list.get(rightward ? n - 1 - i : i);
      Map<String, Object> inner = new LinkedHashMap<>(base);
      inner.put(paramAcc, acc);
      inner.put(paramItem, item);
      acc = Evaluator.evaluate(body, inner);
    }
    return acc;
  }
}
