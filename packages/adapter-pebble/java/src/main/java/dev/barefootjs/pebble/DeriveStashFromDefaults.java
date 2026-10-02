package dev.barefootjs.pebble;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Java twin of {@code packages/jsx/src/ssr-defaults.ts}'s {@code deriveStashFromDefaults}
 * (see that file's doc comment for the full semantics and its sibling ports:
 * Ruby's {@code BarefootJS::Context.derive_vars_from_defaults}
 * (`packages/adapter-erb/lib/barefoot_js.rb:337-360`), Rust's
 * {@code derive_stash_from_defaults}/{@code resolve_child_vars}
 * (`packages/adapter-rust/runtime/src/runtime.rs`)).
 *
 * <p>{@code defaults} is `ir.metadata`-derived {@code extractSsrDefaults()}
 * output, sent VERBATIM (per-entry {@code {value, propName?, isRestProps?}}
 * shape intact) as this Pebble runtime's {@code _bf_manifest.json} — see
 * {@link ChildMeta}. {@code props} is the CALLER's already-mangled prop map
 * (see {@link Bf#render_child}).
 *
 * <p>Both sides of the result are in the TEMPLATE's names (#3250): the
 * compiled `.peb` reads every prop/signal through {@code pebbleIdent}, so an
 * entry named `filter` is returned under `filter_`, and an entry whose
 * {@code propName} is a reserved word is looked up in {@code props} under the
 * mangled name too. Returning the source name made a reserved-word signal
 * render empty, in a child and at the root alike.
 *
 * <p>Semantics (mirrors the TS function's observable behavior exactly):
 * <ul>
 *   <li>A non-Map entry is used AS-IS (defensive — every entry this runtime's
 *       manifest actually emits is the `{value, propName?, isRestProps?}`
 *       shape, but a hand-built manifest might not be).
 *   <li>{@code isRestProps} entries: prefer {@code props[<this entry's own key>]}
 *       when the caller supplied one (checked by containment, so an explicit
 *       `null` value still counts as "supplied"), else the static
 *       {@code value} fallback.
 *   <li>Otherwise: prefer {@code props[propName]} when {@code propName} is set
 *       AND the caller supplied a NON-NULL value for it, else the static
 *       {@code value} fallback. {@code propName}-less entries always use the
 *       static value.
 * </ul>
 *
 * <p>`public` (class and {@link #derive}) for the same reason as
 * {@link ChildMeta}: a host application's ROOT-level render (not a
 * `bf.render_child` call, which already routes through this internally) —
 * e.g. `integrations/spring`'s `Render.renderComponent`, mirroring
 * `render.rs`'s `render_component` calling the Rust runtime's `pub fn
 * derive_stash_from_defaults` directly — needs this exact derivation for a
 * top-level component's OWN `ssrDefaults` (its manifest entry's
 * {@code ChildMeta.ssrDefaults}) against the caller-supplied props, before
 * layering route-specific stash overrides on top.
 */
public final class DeriveStashFromDefaults {

  private DeriveStashFromDefaults() {}

  @SuppressWarnings("unchecked")
  public static Map<String, Object> derive(Map<String, Object> defaults, Map<String, Object> props) {
    Map<String, Object> extra = new LinkedHashMap<>();
    if (defaults == null) {
      return extra;
    }
    for (Map.Entry<String, Object> e : defaults.entrySet()) {
      String name = e.getKey();
      Object dRaw = e.getValue();
      String key = PebbleIdent.mangle(name);
      if (!(dRaw instanceof Map)) {
        // Defensive: mirrors the TS function's `typeof d !== 'object'` guard.
        extra.put(key, dRaw);
        continue;
      }
      Map<String, Object> d = (Map<String, Object>) dRaw;
      if (Boolean.TRUE.equals(d.get("isRestProps"))) {
        extra.put(key, props.containsKey(key) ? props.get(key) : d.get("value"));
        continue;
      }
      Object propNameObj = d.get("propName");
      if (propNameObj instanceof String) {
        String propName = PebbleIdent.mangle((String) propNameObj);
        if (props.containsKey(propName) && props.get(propName) != null) {
          extra.put(key, props.get(propName));
          continue;
        }
      }
      extra.put(key, d.get("value"));
    }
    return extra;
  }

  /**
   * The template vars for a ROOT render (#3250): {@code defaults} derived
   * against the caller's {@code props}, then each of {@code overlays} layered
   * on top in order (later wins) — every key in the template's (mangled)
   * names. {@code props} and the overlays are in SOURCE names, as a host
   * application writes them (`filter`, not `filter_`).
   *
   * <p>Use this rather than {@link #derive} plus a hand-built map: a root
   * context keyed by source names reads as empty for every reserved-word
   * prop or signal, with no render error. `Render.renderComponent` in
   * `integrations/spring` is the reference caller.
   */
  @SafeVarargs
  public static Map<String, Object> rootVars(
      Map<String, Object> defaults, Map<String, ?> props, Map<String, ?>... overlays) {
    Map<String, Object> vars = derive(defaults, PebbleIdent.mangleKeys(props));
    for (Map<String, ?> overlay : overlays) {
      vars.putAll(PebbleIdent.mangleKeys(overlay));
    }
    return vars;
  }
}
