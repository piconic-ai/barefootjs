package dev.barefootjs.pebble;

import java.util.List;
import java.util.Map;

/**
 * Per-child-template metadata `Bf.render_child` needs to render a cross-template
 * child invocation faithfully, read once at {@link Main} startup from the
 * optional `_bf_manifest.json` sidecar the conformance test harness
 * (`packages/adapter-pebble/src/test-render.ts`'s `renderPebbleComponent`)
 * writes alongside every child `.peb` file it generates.
 *
 * <p>Mirrors the fields `packages/adapter-rust/src/test-render.ts`'s
 * `buildChildrenPayload` computes (`ssr_defaults`/`rest_props_name`/
 * `param_names`), plus `componentName` — the ORIGINAL PascalCase component
 * name (not the snake_case template file basename), needed for the
 * no-slot-id random scope-id prefix (`bf.render_child` without a `_bf_slot`
 * prop mints `<ComponentName>_<rand6>`, matching Hono's reference
 * `${name}_${Math.random()...}` root-scope-id fallback for a component
 * rendered with no `__instanceId`).
 *
 * <p>This same manifest-reading facility doubles as the seed of the
 * production Spring Boot integration's manifest-consumption path
 * (`integrations/spring`'s `Render` class calls {@link ManifestLoader#load}
 * directly) — a general `Main`-level facility, not a test-only hack, even
 * though the conformance test harness (`_bf_manifest.json`) and a real
 * `bf build` (`manifest.json`, the SAME `{ssrDefaults, ...}` shape every
 * other adapter's manifest already carries — see `render.rs`'s
 * `ssr_defaults_for`) both produce a file this loader can read. `public`
 * (class and fields, and the {@link ManifestLoader#load} factory) so a host
 * application outside this package can build and hold a
 * {@code Map<String, ChildMeta>} to pass into {@link Bf}'s 3-arg
 * constructor — mirrors the Rust runtime's `pub fn
 * register_components_from_manifest` being the one production entry point
 * `render.rs`'s `new_session` calls.
 */
public final class ChildMeta {
  public final String componentName;
  /** `extractSsrDefaults(childIR.metadata)` output, sent verbatim (per-entry `{value, propName?, isRestProps?}` shape intact). */
  public final Map<String, Object> ssrDefaults;
  /** Local (already-mangled-by-emission-target) rest-props bag name, or `null`. */
  public final String restPropsName;
  /** Caller-facing (`sourceName ?? name`) declared param names — the rest-bag "keep" set. */
  public final List<String> paramNames;

  public ChildMeta(String componentName, Map<String, Object> ssrDefaults, String restPropsName, List<String> paramNames) {
    this.componentName = componentName;
    this.ssrDefaults = ssrDefaults;
    this.restPropsName = restPropsName;
    this.paramNames = paramNames;
  }
}
