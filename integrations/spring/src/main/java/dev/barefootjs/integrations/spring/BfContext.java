package dev.barefootjs.integrations.spring;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.ToNumberPolicy;
import com.google.gson.reflect.TypeToken;
import dev.barefootjs.pebble.ChildMeta;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * Application-wide, request-independent state built once at startup —
 * mirrors {@code integrations/axum}'s {@code AppState} struct
 * (`src/main.rs`): the resolved base path, dev-mode flag, the manifest-
 * derived child-renderer registry (see {@link Render#buildManifest}), the
 * Vite-generated asset URL map (`dist/bf-assets.json`, resolving the blog's
 * hand-written router bootstrap script — see {@link BlogController}), the
 * blog corpus, and the per-visitor todo session store.
 *
 * <p>{@code templatesDir} is {@code src/main/resources/templates} — the
 * exact path {@code vite.config.ts}'s {@code barefoot({ templates: ... })}
 * writes compiled `.peb` templates and `manifest.json` to (per
 * {@code @barefootjs/pebble/vite}'s own docstring, which sketches this exact
 * integration's config). This app reads it as an ordinary FILESYSTEM
 * directory via Pebble's {@code FileLoader} — deliberately NOT via a
 * classpath loader — so dev-mode template reloading (a fresh
 * {@code PebbleEngine} built per request, re-reading from disk — see
 * {@link Render#engine}) works the same way {@code integrations/axum}'s
 * {@code with_env} re-reads `dist/templates` per request in dev: a
 * `bun run build:watch` rebuild is visible on the very next request, no JVM
 * restart needed. The production Docker image preserves this same relative
 * path inside the container (see this repo's {@code Dockerfile}) rather
 * than switching to a classpath loader for the packaged jar, so dev and
 * production share one code path with no mode-specific loader branch.
 */
@Component
public class BfContext {
  private static final Gson GSON = new GsonBuilder()
      .setObjectToNumberStrategy(ToNumberPolicy.DOUBLE)
      .create();

  public final String basePath;
  public final boolean dev;
  public final Path templatesDir;
  public final Map<String, ChildMeta> manifest;
  public final Map<String, String> assets;
  public final BlogData blog;
  public final SessionStore sessions = new SessionStore();

  /** Built once at startup; only actually consulted when `dev` is false — see {@link Render#engine}, which builds a fresh engine per request in dev instead. */
  private final io.pebbletemplates.pebble.PebbleEngine prodEngine;

  public BfContext(
      @Value("${app.base-path}") String basePath,
      @Value("${app.env}") String appEnv) throws IOException {
    this.basePath = normalizeBasePath(basePath);
    this.dev = "development".equals(appEnv);
    this.templatesDir = Path.of("src/main/resources/templates");
    this.manifest = Render.buildManifest(templatesDir);
    this.prodEngine = this.dev ? null : Render.buildEngine(templatesDir);
    this.assets = loadAssets(Path.of("dist/bf-assets.json"));
    this.blog = BlogData.load(Path.of("dist/blog-data.json"));
  }

  /** Strips a trailing slash (but keeps a bare `"/"` as-is) so route mappings never need to special-case a caller-supplied trailing slash in `BASE_PATH` itself. */
  private static String normalizeBasePath(String raw) {
    if (raw.length() > 1 && raw.endsWith("/")) {
      return raw.substring(0, raw.length() - 1);
    }
    return raw;
  }

  /** The engine to render with for THIS request — the shared production instance, or a fresh dev-mode one (see the class docstring). */
  public io.pebbletemplates.pebble.PebbleEngine engine() {
    return dev ? Render.buildEngine(templatesDir) : prodEngine;
  }

  /**
   * Reads `dist/bf-assets.json` (see `vite.config.ts`'s {@code assets}
   * option) into a flat `name -> url` map, degrading to empty on a missing/
   * unparsable file — a fresh `bun run build` always regenerates it, so a
   * missing file just means the build hasn't run yet (mirrors
   * {@code load_assets} in `integrations/axum/src/main.rs`).
   */
  private static Map<String, String> loadAssets(Path path) {
    if (!Files.exists(path)) {
      return Map.of();
    }
    try {
      String text = Files.readString(path);
      Map<String, String> parsed = GSON.fromJson(text, new TypeToken<Map<String, String>>() {}.getType());
      return parsed != null ? parsed : Map.of();
    } catch (IOException | com.google.gson.JsonSyntaxException e) {
      return Map.of();
    }
  }
}
