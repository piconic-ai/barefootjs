package dev.barefootjs.pebble;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Direct unit coverage for {@link Bf#is_element} — the framework "is this a
 * renderable element (not plain text)?" predicate `Slot`'s `asChild`
 * pattern uses (#2266, #3022). Ported from the shared Go/Ruby/Perl
 * runtimes' `IsValidElement`/`is_element`, which the Mojolicious / Xslate /
 * ERB adapters' own `isValidElement` primitives already call. Structurally
 * mirrors `packages/adapter-erb/test/is_element_test.rb`.
 */
class BfIsElementTest {

  private static final Bf BF = new Bf("test");

  @Test
  void mapWithTagAndPropsIsAnElement() {
    Map<String, Object> element = new LinkedHashMap<>();
    element.put("tag", "div");
    element.put("props", new LinkedHashMap<>());
    assertTrue(BF.is_element(element));
  }

  @Test
  void keyMatchIsCaseInsensitive() {
    Map<String, Object> element = new LinkedHashMap<>();
    element.put("Tag", "div");
    element.put("Props", new LinkedHashMap<>());
    assertTrue(BF.is_element(element));
  }

  @Test
  void mapMissingPropsIsNotAnElement() {
    Map<String, Object> notElement = new LinkedHashMap<>();
    notElement.put("tag", "div");
    assertFalse(BF.is_element(notElement));
  }

  @Test
  void mapMissingTagIsNotAnElement() {
    Map<String, Object> notElement = new LinkedHashMap<>();
    notElement.put("props", new LinkedHashMap<>());
    assertFalse(BF.is_element(notElement));
  }

  @Test
  void plainStringChildIsNotAnElement() {
    // A passed-through JSX child is pre-rendered markup (a plain String) on
    // this SSR model -- a non-empty string must NOT read as an element, or
    // `Slot`'s `asChild` guard would wrongly take the element-merge branch.
    assertFalse(BF.is_element("<span>hello</span>"));
  }

  @Test
  void nullIsNotAnElement() {
    assertFalse(BF.is_element(null));
  }

  @Test
  void listIsNotAnElement() {
    assertFalse(BF.is_element(List.of(1, 2, 3)));
  }
}
