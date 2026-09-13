package dev.barefootjs.pebble;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.ToNumberPolicy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Reads a `{snake_case_template_name -> ChildMeta}` map from a manifest JSON
 * file. Two DIFFERENT source shapes, two factory methods:
 *
 * <ul>
 *   <li>{@link #load} — the conformance test harness's `_bf_manifest.json`
 *       sidecar (`packages/adapter-pebble/src/test-render.ts`'s
 *       `renderPebbleComponent`), ALREADY shaped exactly like
 *       {@code Map<String, ChildMeta>}'s wire format (one entry per child
 *       template, keyed by its own snake_case name). {@link Main} (the CLI
 *       entry point `test-render.ts` shells out to) calls this.
 *   <li>{@link #loadFromBuildManifest} — a REAL `bf build`
 *       (`@barefootjs/vite`) `manifest.json`, a DIFFERENT shape entirely
 *       (`{markedTemplate, ssrDefaults?, components?}`, keyed by source-file
 *       path) that needs the same derivation Rust's
 *       `register_components_from_manifest` performs before it matches
 *       {@code ChildMeta}'s wire format — see that method's own doc comment.
 *       {@code integrations/spring}'s `Render` class calls this one; it is
 *       the production path, mirroring the Rust runtime's `pub fn
 *       register_components_from_manifest` being usable from both a test
 *       harness shape and `integrations/axum`'s real manifest.
 * </ul>
 *
 * {@link #load} is extracted out of {@link Main} (which still calls it for
 * its own CLI usage) purely to give {@link #loadFromBuildManifest} a home
 * next to it in one file — see {@link ChildMeta}'s doc comment for the full
 * design rationale behind making this whole facility `public`.
 */
public final class ManifestLoader {

  private static final Gson GSON = new GsonBuilder()
      .setObjectToNumberStrategy(ToNumberPolicy.DOUBLE)
      .create();

  private ManifestLoader() {}

  /**
   * Reads {@code manifestPath} (typically
   * {@code <templatesDir>/_bf_manifest.json}, the conformance test
   * harness's sidecar — NOT a real `bf build`'s `manifest.json`, a
   * different shape entirely; see {@link #loadFromBuildManifest}) into a
   * {@code Map<String, ChildMeta>}. Returns an empty map when the file does
   * not exist — every hand-written-`.peb`-template smoke test in this
   * package has no such sidecar at all, exactly like a component tree with
   * no cross-template child invocations.
   */
  @SuppressWarnings("unchecked")
  public static Map<String, ChildMeta> load(Path manifestPath) throws IOException {
    if (!Files.exists(manifestPath)) {
      return Map.of();
    }
    JsonObject doc = GSON.fromJson(Files.readString(manifestPath), JsonObject.class);
    Map<String, ChildMeta> out = new LinkedHashMap<>();
    if (doc == null) {
      return out;
    }
    for (Map.Entry<String, JsonElement> e : doc.entrySet()) {
      JsonObject entry = e.getValue().getAsJsonObject();
      String componentName = entry.has("componentName") ? entry.get("componentName").getAsString() : e.getKey();
      Object ssrDefaultsRaw = entry.has("ssrDefaults") ? JsonDecode.materialize(entry.get("ssrDefaults")) : null;
      Map<String, Object> ssrDefaults = ssrDefaultsRaw instanceof Map
          ? (Map<String, Object>) ssrDefaultsRaw
          : new LinkedHashMap<>();
      String restPropsName = entry.has("restPropsName") && !entry.get("restPropsName").isJsonNull()
          ? entry.get("restPropsName").getAsString()
          : null;
      List<String> paramNames = new ArrayList<>();
      if (entry.has("paramNames")) {
        for (JsonElement p : entry.getAsJsonArray("paramNames")) {
          paramNames.add(p.getAsString());
        }
      }
      out.put(e.getKey(), new ChildMeta(componentName, ssrDefaults, restPropsName, paramNames));
    }
    return out;
  }

  /**
   * Reads a REAL `bf build` (`@barefootjs/vite`) `manifest.json` —
   * {@code {<manifestKey>: {markedTemplate, ssrDefaults?, components?}}}
   * (see `packages/vite/src/component-manifest.ts`'s `ManifestEntry`) —
   * into a {@code Map<String, ChildMeta>} keyed by the SAME snake_case
   * registry name {@code bf.render_child(...)} calls resolve against.
   *
   * <p>Faithful Java port of the Rust runtime's production registration
   * path, {@code register_components_from_manifest}
   * (`packages/adapter-rust/runtime/src/manifest.rs`) — see that file's
   * module doc comment for the full design rationale this port shares
   * line-for-line: entries are looked up FLAT (`"Counter"`, `"ToggleItem"`,
   * ..., this repo's convention for a plain {@code components: [...]}
   * config) or `ui/<name>/index` (a component-library registry
   * convention); `ssrDefaults` is read from the entry's TOP LEVEL only
   * (the primary/first exported component of that source file — see
   * `component-manifest.ts`'s own comment on why the top-level fields
   * already cover the common one-component-per-file case), never from the
   * per-`templatesPerComponent`-component {@code components} map; and
   * {@code restPropsName}/{@code paramNames} are DERIVED by scanning
   * `ssrDefaults` for `isRestProps`/`propName` entries rather than being
   * separate manifest fields (this Java runtime's {@link ChildMeta} has no
   * separate `template` field the way Rust's `ChildRendererSpec` does —
   * the registry key doubles as the `.peb` file's own base name, per
   * `PebbleAdapter.toTemplateName`, so `markedTemplate`'s VALUE is only
   * consulted as an is-this-entry-real presence check, never parsed for
   * its path).
   *
   * <p>Like Rust's port, a source file compiling multiple SIBLING
   * components (e.g. `Toggle.tsx` exporting both `Toggle` and
   * `ToggleItem`) only registers its PRIMARY export this way — the
   * `components` map naming every sibling is present in the manifest but
   * intentionally unread here. A host needing one of those siblings
   * reachable via `bf.render_child(...)` (with no `ssrDefaults` of its
   * own, since none of this repo's real sibling children need one beyond
   * what their parent template's own `render_child(...)` call supplies
   * inline) registers it directly instead — mirrors `render.rs`'s
   * `EXTRA_CHILDREN` list; see `integrations/spring`'s `Render` class.
   */
  public static Map<String, ChildMeta> loadFromBuildManifest(Path manifestJsonPath) throws IOException {
    if (!Files.exists(manifestJsonPath)) {
      return Map.of();
    }
    JsonObject doc = GSON.fromJson(Files.readString(manifestJsonPath), JsonObject.class);
    Map<String, ChildMeta> out = new LinkedHashMap<>();
    if (doc == null) {
      return out;
    }
    for (Map.Entry<String, JsonElement> e : doc.entrySet()) {
      String entryName = e.getKey();
      if (entryName.equals("__barefoot__") || !e.getValue().isJsonObject()) {
        continue;
      }
      String componentName = componentNameForEntry(entryName);
      if (componentName == null) {
        continue;
      }
      JsonObject entryObj = e.getValue().getAsJsonObject();
      boolean hasMarkedTemplate = entryObj.has("markedTemplate")
          && !entryObj.get("markedTemplate").isJsonNull()
          && !entryObj.get("markedTemplate").getAsString().isEmpty();
      if (!hasMarkedTemplate) {
        continue;
      }
      registerBuildManifestEntry(out, componentName, entryObj);
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private static void registerBuildManifestEntry(Map<String, ChildMeta> out, String componentName, JsonObject entryObj) {
    Object ssrDefaultsRaw = entryObj.has("ssrDefaults") ? JsonDecode.materialize(entryObj.get("ssrDefaults")) : null;
    Map<String, Object> ssrDefaults = ssrDefaultsRaw instanceof Map
        ? (Map<String, Object>) ssrDefaultsRaw
        : new LinkedHashMap<>();

    // `paramNames` carries the CALLER-facing `propName`, not a given
    // entry's own (local) key — `Bf.render_child`'s rest-bag "keep" set
    // compares against child props keyed by whatever the calling template
    // passed, not the child's local binding — see manifest.rs's own
    // comment on this exact point.
    String restPropsName = null;
    List<String> paramNames = new ArrayList<>();
    for (Map.Entry<String, Object> d : ssrDefaults.entrySet()) {
      if (!(d.getValue() instanceof Map)) {
        continue;
      }
      Map<String, Object> dm = (Map<String, Object>) d.getValue();
      if (Boolean.TRUE.equals(dm.get("isRestProps"))) {
        restPropsName = d.getKey();
      } else if (dm.get("propName") instanceof String) {
        paramNames.add((String) dm.get("propName"));
      }
    }

    out.put(toSnakeCase(componentName), new ChildMeta(componentName, ssrDefaults, restPropsName, paramNames));
  }

  /**
   * `ui/<name>/index` -> `<name>`; any other manifest key with no `/` is
   * used verbatim as the PascalCase component name (this repo's flat
   * `components: [...]` convention — see manifest.rs's identical function
   * for the empirical confirmation this is what every real build without a
   * `ui/` component-library registry produces). A key with a `/` that
   * isn't `ui/<name>/index`-shaped is an unrecognised nested path shape,
   * skipped rather than guessed at.
   */
  private static String componentNameForEntry(String entryName) {
    if (entryName.startsWith("ui/")) {
      String rest = entryName.substring(3);
      return rest.endsWith("/index") ? rest.substring(0, rest.length() - "/index".length()) : null;
    }
    return entryName.contains("/") ? null : entryName;
  }

  /**
   * PascalCase -> snake_case, byte-identical to `PebbleAdapter.
   * toTemplateName`'s regex (`replace(/([A-Z])/g, '_$1').toLowerCase().
   * replace(/^_/, '')`) and to `manifest.rs`'s `to_template_name` — every
   * uppercase letter gets a preceding underscore (including consecutive
   * capitals, e.g. `AIChatInteractive` -> `a_i_chat_interactive`), then a
   * leading underscore (from the first character being uppercase) is
   * stripped.
   */
  public static String toSnakeCase(String componentName) {
    StringBuilder out = new StringBuilder(componentName.length() + 4);
    for (int i = 0; i < componentName.length(); i++) {
      char c = componentName.charAt(i);
      if (Character.isUpperCase(c)) {
        if (i > 0) {
          out.append('_');
        }
        out.append(Character.toLowerCase(c));
      } else {
        out.append(c);
      }
    }
    return out.toString();
  }
}
