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
 * <p>This same manifest-reading facility is designed to double as the seed
 * of a later production Spring-Boot-integration manifest-consumption path
 * (see the `add-adapter` Phase 4 task description) — implemented as a
 * general `Main`-level facility, not a test-only hack, even though only the
 * test harness produces `_bf_manifest.json` today.
 */
final class ChildMeta {
  final String componentName;
  /** `extractSsrDefaults(childIR.metadata)` output, sent verbatim (per-entry `{value, propName?, isRestProps?}` shape intact). */
  final Map<String, Object> ssrDefaults;
  /** Local (already-mangled-by-emission-target) rest-props bag name, or `null`. */
  final String restPropsName;
  /** Caller-facing (`sourceName ?? name`) declared param names — the rest-bag "keep" set. */
  final List<String> paramNames;

  ChildMeta(String componentName, Map<String, Object> ssrDefaults, String restPropsName, List<String> paramNames) {
    this.componentName = componentName;
    this.ssrDefaults = ssrDefaults;
    this.restPropsName = restPropsName;
    this.paramNames = paramNames;
  }
}
