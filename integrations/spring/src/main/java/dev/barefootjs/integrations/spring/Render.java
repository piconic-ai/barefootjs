package dev.barefootjs.integrations.spring;

import dev.barefootjs.pebble.Bf;
import dev.barefootjs.pebble.ChildMeta;
import dev.barefootjs.pebble.DeriveStashFromDefaults;
import dev.barefootjs.pebble.ManifestLoader;
import dev.barefootjs.pebble.ext.SetBlockExtension;
import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.extension.escaper.SafeString;
import io.pebbletemplates.pebble.loader.FileLoader;
import io.pebbletemplates.pebble.template.PebbleTemplate;

import java.io.IOException;
import java.io.StringWriter;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Rendering helpers built on the Pebble Java runtime
 * (`dev.barefootjs.pebble.*`, `packages/adapter-pebble/java`) — the
 * Java-shaped equivalent of `integrations/axum/src/render.rs`, adapted to
 * this runtime's manifest-driven child registration
 * ({@link ManifestLoader#loadFromBuildManifest}), which removes MOST of
 * manual per-route child-component wiring: any component that is its OWN
 * top-level source file under `components: [...]` gets a `manifest.json`
 * entry and is registered generically, once at startup.
 *
 * <p>One category still needs manual registration, mirroring
 * {@code render.rs}'s {@code EXTRA_CHILDREN} exactly: a component defined
 * as a SIBLING inside another file rather than its own top-level source
 * file (`ToggleItem` inside `Toggle.tsx`, `ReactiveChild`/
 * `PropsStyleChild`/`DestructuredStyleChild` inside `ReactiveProps.tsx`)
 * still compiles to its own `.peb` template, but does NOT get its own
 * `manifest.json` entry (only a source file's PRIMARY export does — see
 * {@link ManifestLoader#loadFromBuildManifest}'s doc comment). None of
 * these need SSR defaults beyond what their parent template's compiled
 * `render_child(...)` call already supplies inline, so they are registered
 * with empty `ssrDefaults`/no rest-props bag.
 */
public final class Render {

  private Render() {}

  /** `(registry key, template/component base name)` — see the class docstring. */
  private static final String[][] EXTRA_CHILDREN = {
      {"toggle_item", "ToggleItem"},
      {"reactive_child", "ReactiveChild"},
      {"props_style_child", "PropsStyleChild"},
      {"destructured_style_child", "DestructuredStyleChild"},
  };

  /** Build the manifest-derived child-renderer registry once at startup, plus the {@code EXTRA_CHILDREN} manual registrations — see the class docstring. */
  public static Map<String, ChildMeta> buildManifest(Path templatesDir) throws IOException {
    Map<String, ChildMeta> manifest = new LinkedHashMap<>(
        ManifestLoader.loadFromBuildManifest(templatesDir.resolve("manifest.json")));
    for (String[] pair : EXTRA_CHILDREN) {
      manifest.put(pair[0], new ChildMeta(pair[1], Map.of(), null, List.of()));
    }
    return manifest;
  }

  /**
   * Build a `PebbleEngine` reading `.peb` templates from `templatesDir` on
   * disk — same construction as `Main.render` (strict variables off, the
   * `{% set %}...{% endset %}` block-capture extension registered).
   */
  public static PebbleEngine buildEngine(Path templatesDir) {
    // Pebble's `FileLoader.setPrefix` REJECTS a relative path outright
    // (`LoaderException: Prefix must be an absolute path`) -- unlike
    // `Main.render`'s CLI usage, where the caller already hands in an
    // absolute path. `toAbsolutePath()` resolves against the JVM's working
    // directory (Gradle's `bootRun`/the packaged jar's `java -jar`
    // invocation both run from this project's own directory).
    FileLoader loader = new FileLoader(templatesDir.toAbsolutePath().toString());
    loader.setSuffix(".peb");
    return new PebbleEngine.Builder()
        .loader(loader)
        .strictVariables(false)
        .extension(new SetBlockExtension())
        .build();
  }

  /**
   * Mint a fresh, bare `Bf` purely to anchor a NEW shared render tree's
   * accumulator state ({@link Bf#newRoot} clones of it, one per island, are
   * what actually render — see {@link BfContext}'s docstring and
   * `integrations/spring`'s `BlogController`) — the Java-shaped equivalent
   * of `render.rs`'s `new_session()` (which builds a bare
   * `Arc<RenderSession>` nothing is rendered against directly either).
   * {@code manifest} may be a per-request COPY with a `signal_init`-style
   * override applied (see {@link #withSignalOverride}) — every island's
   * `render_child` call resolves against whatever manifest THIS seed (and
   * every `newRoot` clone of it) was built with.
   */
  public static Bf newRenderTreeSeed(BfContext ctx, Map<String, ChildMeta> manifest) {
    return new Bf("_seed_" + randHex6(), ctx.engine(), manifest);
  }

  /**
   * Layer a STATIC override onto ONE manifest entry's `ssrDefaults`
   * (merged, not replacing the whole map — an entry's own OTHER static
   * defaults survive), returning a NEW manifest map that leaves
   * {@code ctx.manifest} (shared, immutable, built once at startup)
   * untouched — mirrors `render.rs`'s `new_session(state, signal_init)`
   * parameter, the opt-in per-registry-key override for the rare child
   * whose derivation the static ssrDefaults extractor can't see through
   * (e.g. the blog's `NowPlaying`-as-a-child-of-`PostArticle`, which needs
   * a `Math` stash entry no signal/prop analysis would ever produce — see
   * `BlogController#postRoute`).
   */
  public static Map<String, ChildMeta> withSignalOverride(
      Map<String, ChildMeta> manifest, String registryKey, Map<String, Object> override) {
    Map<String, ChildMeta> out = new LinkedHashMap<>(manifest);
    ChildMeta base = out.get(registryKey);
    Map<String, Object> mergedDefaults = base != null ? new LinkedHashMap<>(base.ssrDefaults) : new LinkedHashMap<>();
    mergedDefaults.putAll(override);
    out.put(registryKey, new ChildMeta(
        base != null ? base.componentName : registryKey,
        mergedDefaults,
        base != null ? base.restPropsName : null,
        base != null ? base.paramNames : List.of()));
    return out;
  }

  private static String randHex6() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 6);
  }

  private static Map<String, Object> ssrDefaultsFor(Map<String, ChildMeta> manifest, String componentName) {
    ChildMeta meta = manifest.get(ManifestLoader.toSnakeCase(componentName));
    return meta != null ? meta.ssrDefaults : Map.of();
  }

  /**
   * The rendered body HTML plus the accumulated `<script>`/`<link>` tags
   * ({@link Bf#scripts()}) and SSR-portal elements ({@link Bf#portals()},
   * #3119) for every component (root + every child it reached).
   */
  public record Rendered(String body, String scripts, String portals) {}

  /**
   * Render one component as the root of a page. `props` becomes the source
   * for any `ssrDefaults` entry whose `propName` matches a key in `props`
   * (via {@link DeriveStashFromDefaults#derive}); `stash` is layered on top
   * afterwards and always wins — for SSR-only derived values no
   * `ssrDefaults` entry could ever hold (e.g. `ConditionalReturn`'s
   * `variant`).
   */
  public static Rendered renderComponent(
      BfContext ctx, String componentName, Map<String, Object> props, Map<String, Object> stash) throws IOException {
    return renderComponent(ctx, componentName, props, stash, null);
  }

  /** Like {@link #renderComponent(BfContext, String, Map, Map)}, but sharing an existing root's accumulator state (see {@link Bf#newRoot}) — used for a page composed of several independently-rendered top-level islands. */
  public static Rendered renderComponent(
      BfContext ctx, String componentName, Map<String, Object> props, Map<String, Object> stash, Bf sharedRoot)
      throws IOException {
    Map<String, Object> defaults = ssrDefaultsFor(ctx.manifest, componentName);
    Map<String, Object> vars = new LinkedHashMap<>(DeriveStashFromDefaults.derive(defaults, props));
    vars.putAll(stash);
    return renderRoot(ctx, componentName, props, vars, sharedRoot);
  }

  /**
   * Like {@link #renderComponent}, but for the ONE shape that plain
   * `Map<String, Object>` vars can't carry: a pre-rendered HTML fragment
   * that must reach the template as a SAFE value — the compiled
   * `PageShell.peb` interpolates its `children` prop as
   * `{{ bf.string(children) }}` (no `| raw`), which only stays unescaped
   * when `children` arrives as an already-safe Pebble value
   * ({@link SafeString} — see {@code Bf#string}'s doc comment for why).
   */
  public static Rendered renderComponentWithRawChildren(
      BfContext ctx, String componentName, Map<String, Object> props, Map<String, Object> stash, String childrenHtml,
      Bf sharedRoot) throws IOException {
    Map<String, Object> defaults = ssrDefaultsFor(ctx.manifest, componentName);
    Map<String, Object> vars = new LinkedHashMap<>(DeriveStashFromDefaults.derive(defaults, props));
    vars.putAll(stash);
    vars.put("children", new SafeString(childrenHtml));
    return renderRoot(ctx, componentName, props, vars, sharedRoot);
  }

  /**
   * Render one island subtree that shares an ALREADY-CREATED root `Bf`
   * instance's accumulator state (see {@link Bf#newRoot}) — the blog's
   * shell composition (`ThemeToggle` + `Sidebar` + `PageShell` wrapping
   * route content) mirrors `render.rs`'s `render_island`: `{**seed,
   * **props, **extra}` semantics — the caller's client props are ALSO
   * template vars wholesale, not just where an `ssrDefaults` entry's
   * `propName` picks them up (`PostArticle` depends on this: its
   * `title`/`date`/`body`/… props have no static defaults, so
   * `deriveStashFromDefaults` alone would drop them and the article would
   * SSR empty).
   */
  public static Rendered renderIsland(
      BfContext ctx, Bf sharedRoot, String componentName, Map<String, Object> props, Map<String, Object> extra)
      throws IOException {
    Map<String, Object> defaults = ssrDefaultsFor(ctx.manifest, componentName);
    Map<String, Object> vars = new LinkedHashMap<>(DeriveStashFromDefaults.derive(defaults, props));
    vars.putAll(props);
    vars.putAll(extra);
    return renderRoot(ctx, componentName, props, vars, sharedRoot);
  }

  /** Shared tail: mint a root scope id (or reuse `sharedRoot`'s accumulator via {@link Bf#newRoot}) and evaluate `componentName`'s compiled template with `vars`. */
  private static Rendered renderRoot(
      BfContext ctx, String componentName, Map<String, Object> props, Map<String, Object> vars, Bf sharedRoot)
      throws IOException {
    String scopeId = componentName + "_" + randHex6();
    // `root.props = Some(props.clone())` on a non-empty root `props` map —
    // the `bf-p` hydration payload a `@client`-marked root's compiled
    // `bf.props_attr()` call emits (see `Bf`'s `(String, PebbleEngine, Map,
    // Object)` constructor / `newRoot(String, Bf, Object)` overload, added
    // for exactly this) — lets the client runtime re-hydrate with the
    // ORIGINAL root props rather than silently discarding an SSR'd list/
    // object prop and re-rendering from an empty default. Confirmed
    // load-bearing empirically: without this, `/toggle`'s three
    // `ToggleItem`s (an SSR'd LIST prop, `toggleItems`) render correctly on
    // the server but vanish the instant the client runtime hydrates.
    Object rootProps = (props != null && !props.isEmpty()) ? props : null;
    Bf bf = sharedRoot == null
        ? new Bf(scopeId, ctx.engine(), ctx.manifest, rootProps)
        : Bf.newRoot(scopeId, sharedRoot, rootProps);

    Map<String, Object> context = new LinkedHashMap<>(vars);
    context.put("bf", bf);

    // ROOT-level lookups use `componentName` VERBATIM (PascalCase) -- that
    // is the actual on-disk `.peb` filename `@barefootjs/vite` writes
    // (`packages/vite/src/paths.ts`'s `perComponentRelPath`:
    // `${componentName}${extension}`, e.g. `Counter.peb`). This is
    // DELIBERATELY NOT `ManifestLoader.toSnakeCase(componentName)`: that
    // snake_case form is the REGISTRY KEY `bf.render_child(...)` calls use
    // (and what `ctx.manifest`/`ssrDefaultsFor` are keyed by) — it matches
    // an ACTUAL file on disk only because `scripts/snake-case-templates.ts`
    // (run as part of `bun run build`) additionally copies every
    // `<Name>.peb` to `<name_case>.peb` specifically so `bf.render_child`'s
    // snake_case call sites resolve. See that script's docstring for why
    // this copy is needed at all (a real gap between `PebbleAdapter`'s
    // `toTemplateName()`, used for render_child call sites, and
    // `perComponentRelPath`, used for the actual file name — the
    // conformance harness papers over this by writing its OWN
    // snake_case-named copies into a throwaway temp dir, which a real Vite
    // build never does).
    PebbleTemplate template = ctx.engine().getTemplate(componentName);
    StringWriter writer = new StringWriter();
    template.evaluate(writer, context);
    return new Rendered(writer.toString(), bf.scripts(), bf.portals());
  }

  /** Convenience: an empty props/stash map, for routes with nothing to pass. */
  public static Map<String, Object> emptyObj() {
    return Map.of();
  }

  /** Terser call-site builder for a literal props/stash map — `obj("k1", v1, "k2", v2, ...)`. */
  public static Map<String, Object> obj(Object... kv) {
    if (kv.length % 2 != 0) {
      throw new IllegalArgumentException("obj(...) needs an even number of arguments");
    }
    Map<String, Object> out = new LinkedHashMap<>();
    for (int i = 0; i < kv.length; i += 2) {
      out.put((String) kv[i], kv[i + 1]);
    }
    return out;
  }

  /** Builds a mutable {@code List<Object>} from the given items — plain {@code List.of(...)} rejects `null` elements, which a few call sites need (e.g. the blog pager's absent prev/next post). */
  public static List<Object> arr(Object... items) {
    List<Object> out = new ArrayList<>(items.length);
    for (Object item : items) {
      out.add(item);
    }
    return out;
  }
}
