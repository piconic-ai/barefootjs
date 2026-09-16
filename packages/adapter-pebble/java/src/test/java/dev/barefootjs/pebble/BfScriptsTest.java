package dev.barefootjs.pebble;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Direct unit coverage for {@link Bf#register_script}/{@link
 * Bf#register_preload}/{@link Bf#scripts()} and {@link Bf#newRoot} — the new
 * production-API surface added for a real host (e.g. `integrations/spring`)
 * to recover a render tree's accumulated `<script>`/`<link
 * rel="modulepreload">` tags and to compose a page out of several
 * independently-rendered top-level islands sharing one accumulator (BarefootJS
 * #2101). No `PebbleEngine`/template involved — these are plain instance
 * methods on `Bf`, exercised directly.
 */
class BfScriptsTest {

  @Test
  void emptyByDefault() {
    Bf bf = new Bf("Root_test");
    assertEquals("", bf.scripts());
  }

  @Test
  void oneScriptRegistration() {
    Bf bf = new Bf("Root_test");
    bf.register_script("/assets/entry.js");
    assertEquals("<script type=\"module\" src=\"/assets/entry.js\"></script>", bf.scripts());
  }

  @Test
  void preloadsComeBeforeScripts_regardlessOfRegistrationOrder() {
    Bf bf = new Bf("Root_test");
    bf.register_script("/assets/entry.js");
    bf.register_preload("/assets/entry.js");
    assertEquals(
        "<link rel=\"modulepreload\" href=\"/assets/entry.js\">\n"
            + "<script type=\"module\" src=\"/assets/entry.js\"></script>",
        bf.scripts());
  }

  @Test
  void duplicateScriptUrlRegistersOnlyOnce() {
    Bf bf = new Bf("Root_test");
    bf.register_script("/assets/entry.js");
    bf.register_script("/assets/entry.js");
    bf.register_script("/assets/entry.js");
    assertEquals("<script type=\"module\" src=\"/assets/entry.js\"></script>", bf.scripts());
  }

  @Test
  void duplicatePreloadUrlRegistersOnlyOnce() {
    Bf bf = new Bf("Root_test");
    bf.register_preload("/assets/entry.js");
    bf.register_preload("/assets/entry.js");
    assertEquals("<link rel=\"modulepreload\" href=\"/assets/entry.js\">", bf.scripts());
  }

  @Test
  void registrationOrderIsPreservedAmongDistinctUrls() {
    Bf bf = new Bf("Root_test");
    bf.register_script("/assets/a.js");
    bf.register_script("/assets/b.js");
    bf.register_script("/assets/c.js");
    assertEquals(
        "<script type=\"module\" src=\"/assets/a.js\"></script>\n"
            + "<script type=\"module\" src=\"/assets/b.js\"></script>\n"
            + "<script type=\"module\" src=\"/assets/c.js\"></script>",
        bf.scripts());
  }

  @Test
  void urlIsHtmlEscaped() {
    Bf bf = new Bf("Root_test");
    bf.register_script("/assets/a&b.js");
    assertTrue(bf.scripts().contains("a&amp;b.js"));
  }

  @Test
  void newRootSharesScriptsAcrossIndependentInstances() {
    Bf first = new Bf("Header_test");
    Bf second = Bf.newRoot("Sidebar_test", first);

    first.register_script("/assets/header.js");
    second.register_script("/assets/sidebar.js");

    // Both instances see the FULL accumulated set — this is the composed
    // page's whole point: any island can be read back from after all
    // islands have rendered.
    String expected =
        "<script type=\"module\" src=\"/assets/header.js\"></script>\n"
            + "<script type=\"module\" src=\"/assets/sidebar.js\"></script>";
    assertEquals(expected, first.scripts());
    assertEquals(expected, second.scripts());
  }

  @Test
  void newRootDedupesAcrossIndependentInstancesToo() {
    Bf first = new Bf("Header_test");
    Bf second = Bf.newRoot("Sidebar_test", first);

    first.register_script("/assets/shared.js");
    second.register_script("/assets/shared.js");

    assertEquals("<script type=\"module\" src=\"/assets/shared.js\"></script>", first.scripts());
  }

  @Test
  void newRootWithNoRootPropsHasEmptyPropsAttr() {
    Bf first = new Bf("Header_test");
    Bf second = Bf.newRoot("Sidebar_test", first);
    assertEquals("", second.props_attr());
  }

  @Test
  void newRootSeedsItsOwnBfPMarkerIndependentlyOfSibling() {
    Bf first = new Bf("Header_test", null, Map.of(), Map.of("title", "Header"));
    Bf second = Bf.newRoot("Sidebar_test", first, Map.of("collapsed", true));

    assertTrue(first.props_attr().contains("Header"));
    assertTrue(second.props_attr().contains("collapsed"));
    // Neither island's bf-p marker leaks into the other's.
    assertTrue(!first.props_attr().contains("collapsed"));
    assertTrue(!second.props_attr().contains("Header"));
  }
}
