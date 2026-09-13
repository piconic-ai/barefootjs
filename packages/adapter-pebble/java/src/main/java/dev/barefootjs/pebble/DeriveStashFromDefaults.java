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
 */
final class DeriveStashFromDefaults {

  private DeriveStashFromDefaults() {}

  @SuppressWarnings("unchecked")
  static Map<String, Object> derive(Map<String, Object> defaults, Map<String, Object> props) {
    Map<String, Object> extra = new LinkedHashMap<>();
    if (defaults == null) {
      return extra;
    }
    for (Map.Entry<String, Object> e : defaults.entrySet()) {
      String name = e.getKey();
      Object dRaw = e.getValue();
      if (!(dRaw instanceof Map)) {
        // Defensive: mirrors the TS function's `typeof d !== 'object'` guard.
        extra.put(name, dRaw);
        continue;
      }
      Map<String, Object> d = (Map<String, Object>) dRaw;
      if (Boolean.TRUE.equals(d.get("isRestProps"))) {
        extra.put(name, props.containsKey(name) ? props.get(name) : d.get("value"));
        continue;
      }
      Object propNameObj = d.get("propName");
      if (propNameObj instanceof String) {
        String propName = (String) propNameObj;
        if (props.containsKey(propName) && props.get(propName) != null) {
          extra.put(name, props.get(propName));
          continue;
        }
      }
      extra.put(name, d.get("value"));
    }
    return extra;
  }
}
