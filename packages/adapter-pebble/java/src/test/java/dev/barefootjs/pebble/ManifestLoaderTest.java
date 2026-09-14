package dev.barefootjs.pebble;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Direct unit coverage for {@link ManifestLoader#loadFromBuildManifest} — the
 * production `bf build` `manifest.json` reader `integrations/spring`'s
 * `Render` class calls (BarefootJS #2101). Covers every branch: flat entries,
 * `ui/<name>/index` entries, the `__barefoot__`/missing-`markedTemplate`
 * skips, and `isRestProps`/`propName` derivation from `ssrDefaults`. {@link
 * ManifestLoader#toSnakeCase} is also exercised directly, including the
 * consecutive-uppercase case its own doc comment calls out.
 */
class ManifestLoaderTest {

  private static Path writeManifest(Path dir, String json) throws Exception {
    Path path = dir.resolve("manifest.json");
    Files.writeString(path, json);
    return path;
  }

  @Test
  void missingFileReturnsEmptyMap(@TempDir Path dir) throws Exception {
    Map<String, ChildMeta> result = ManifestLoader.loadFromBuildManifest(dir.resolve("does-not-exist.json"));
    assertTrue(result.isEmpty());
  }

  @Test
  void flatEntryRegistersUnderSnakeCaseKey(@TempDir Path dir) throws Exception {
    Path manifest = writeManifest(dir, """
        {
          "ToggleItem": { "markedTemplate": "templates/ToggleItem.peb" }
        }
        """);
    Map<String, ChildMeta> result = ManifestLoader.loadFromBuildManifest(manifest);
    assertTrue(result.containsKey("toggle_item"));
    assertEquals("ToggleItem", result.get("toggle_item").componentName);
  }

  @Test
  void uiPrefixedEntryStripsToBareName(@TempDir Path dir) throws Exception {
    Path manifest = writeManifest(dir, """
        {
          "ui/Button/index": { "markedTemplate": "templates/Button.peb" }
        }
        """);
    Map<String, ChildMeta> result = ManifestLoader.loadFromBuildManifest(manifest);
    assertTrue(result.containsKey("button"));
    assertEquals("Button", result.get("button").componentName);
  }

  @Test
  void nestedPathNotShapedLikeUiIndexIsSkipped(@TempDir Path dir) throws Exception {
    Path manifest = writeManifest(dir, """
        {
          "foo/Bar": { "markedTemplate": "templates/Bar.peb" }
        }
        """);
    Map<String, ChildMeta> result = ManifestLoader.loadFromBuildManifest(manifest);
    assertTrue(result.isEmpty());
  }

  @Test
  void barefootMetaKeyIsSkipped(@TempDir Path dir) throws Exception {
    Path manifest = writeManifest(dir, """
        {
          "__barefoot__": { "version": 1 },
          "Counter": { "markedTemplate": "templates/Counter.peb" }
        }
        """);
    Map<String, ChildMeta> result = ManifestLoader.loadFromBuildManifest(manifest);
    assertEquals(1, result.size());
    assertTrue(result.containsKey("counter"));
  }

  @Test
  void missingMarkedTemplateIsSkipped(@TempDir Path dir) throws Exception {
    Path manifest = writeManifest(dir, """
        {
          "Counter": { "ssrDefaults": {} }
        }
        """);
    Map<String, ChildMeta> result = ManifestLoader.loadFromBuildManifest(manifest);
    assertTrue(result.isEmpty());
  }

  @Test
  void nullMarkedTemplateIsSkipped(@TempDir Path dir) throws Exception {
    Path manifest = writeManifest(dir, """
        {
          "Counter": { "markedTemplate": null }
        }
        """);
    Map<String, ChildMeta> result = ManifestLoader.loadFromBuildManifest(manifest);
    assertTrue(result.isEmpty());
  }

  @Test
  void emptyMarkedTemplateIsSkipped(@TempDir Path dir) throws Exception {
    Path manifest = writeManifest(dir, """
        {
          "Counter": { "markedTemplate": "" }
        }
        """);
    Map<String, ChildMeta> result = ManifestLoader.loadFromBuildManifest(manifest);
    assertTrue(result.isEmpty());
  }

  @Test
  void isRestPropsEntryBecomesRestPropsName(@TempDir Path dir) throws Exception {
    Path manifest = writeManifest(dir, """
        {
          "PostListItem": {
            "markedTemplate": "templates/PostListItem.peb",
            "ssrDefaults": {
              "rest": { "value": {}, "isRestProps": true }
            }
          }
        }
        """);
    Map<String, ChildMeta> result = ManifestLoader.loadFromBuildManifest(manifest);
    ChildMeta meta = result.get("post_list_item");
    assertEquals("rest", meta.restPropsName);
    assertTrue(meta.paramNames.isEmpty());
  }

  @Test
  void propNameEntryBecomesAParamName(@TempDir Path dir) throws Exception {
    Path manifest = writeManifest(dir, """
        {
          "ToggleItem": {
            "markedTemplate": "templates/ToggleItem.peb",
            "ssrDefaults": {
              "count": { "value": 0, "propName": "n" }
            }
          }
        }
        """);
    Map<String, ChildMeta> result = ManifestLoader.loadFromBuildManifest(manifest);
    ChildMeta meta = result.get("toggle_item");
    assertNull(meta.restPropsName);
    // paramNames carries the CALLER-facing propName ("n"), not the entry's
    // own local key ("count") — see registerBuildManifestEntry's doc comment.
    assertEquals(1, meta.paramNames.size());
    assertEquals("n", meta.paramNames.get(0));
  }

  @Test
  void bareValueSsrDefaultsEntryContributesNeitherRestPropsNorParamName(@TempDir Path dir) throws Exception {
    Path manifest = writeManifest(dir, """
        {
          "Counter": {
            "markedTemplate": "templates/Counter.peb",
            "ssrDefaults": {
              "count": { "value": 0 }
            }
          }
        }
        """);
    Map<String, ChildMeta> result = ManifestLoader.loadFromBuildManifest(manifest);
    ChildMeta meta = result.get("counter");
    assertNull(meta.restPropsName);
    assertTrue(meta.paramNames.isEmpty());
    assertTrue(meta.ssrDefaults.containsKey("count"));
  }

  @Test
  void toSnakeCase_singleWord() {
    assertEquals("counter", ManifestLoader.toSnakeCase("Counter"));
  }

  @Test
  void toSnakeCase_camelWords() {
    assertEquals("toggle_item", ManifestLoader.toSnakeCase("ToggleItem"));
  }

  @Test
  void toSnakeCase_consecutiveUppercase() {
    assertEquals("a_i_chat_interactive", ManifestLoader.toSnakeCase("AIChatInteractive"));
  }

  @Test
  void loadStillWorksForTheConformanceHarnessSidecarShape(@TempDir Path dir) throws Exception {
    // Sanity check that extracting `load()` out of `Main` didn't change its
    // own (different, already-established) shape or behavior.
    Path manifest = writeManifest(dir, """
        {
          "toggle_item": { "componentName": "ToggleItem" }
        }
        """);
    Map<String, ChildMeta> result = ManifestLoader.load(manifest);
    assertEquals("ToggleItem", result.get("toggle_item").componentName);
    assertFalse(result.get("toggle_item").ssrDefaults == null);
  }
}
