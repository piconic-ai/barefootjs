package dev.barefootjs.pebble;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Java port of `packages/adapter-jinja/python/barefootjs/search_params.py`
 * (itself ported from `packages/adapter-perl/lib/BarefootJS/SearchParams.pm`)
 * — the request-scoped SSR view of the query string behind the reactive
 * `searchParams()` environment signal (#1922). The compiled `.peb` template
 * reads it as `{{ searchParams.get('key') }}` — Pebble resolves a
 * dot-method call against any public method on the context value, so this
 * needs no adapter-side special casing beyond seeding a `searchParams`
 * key of this type in the render context (see {@link Main}).
 *
 * <p>Semantics mirror the browser's `URLSearchParams.get` exactly: the
 * first value for a key, or `null` when the key is absent (a
 * present-but-empty value returns `""`, distinct from absent — the `??`
 * lowering's null/undefined-only coalescing relies on this distinction).
 */
final class SearchParams {

  private final Map<String, List<String>> values = new LinkedHashMap<>();

  SearchParams(String query) {
    String q = query == null ? "" : query;
    if (q.startsWith("?")) {
      q = q.substring(1);
    }
    if (q.isEmpty()) {
      return;
    }
    for (String pair : q.split("[&;]", -1)) {
      if (pair.isEmpty()) {
        continue;
      }
      int eq = pair.indexOf('=');
      String key = eq < 0 ? pair : pair.substring(0, eq);
      String val = eq < 0 ? null : pair.substring(eq + 1);
      key = decode(key);
      String decodedVal = val == null ? "" : decode(val);
      values.computeIfAbsent(key, k -> new java.util.ArrayList<>()).add(decodedVal);
    }
  }

  /** First value for `key`, or `null` when the key is absent. */
  public String get(String key) {
    List<String> vals = values.get(key);
    return (vals == null || vals.isEmpty()) ? null : vals.get(0);
  }

  /** `application/x-www-form-urlencoded` decode: `+` -> space, then percent-decode. Never throws on malformed input (lenient, matching the browser). */
  private static String decode(String s) {
    String withSpaces = s.replace('+', ' ');
    java.io.ByteArrayOutputStream raw = new java.io.ByteArrayOutputStream();
    int n = withSpaces.length();
    int i = 0;
    while (i < n) {
      char c = withSpaces.charAt(i);
      if (c == '%' && i + 2 < n && isHex(withSpaces.charAt(i + 1)) && isHex(withSpaces.charAt(i + 2))) {
        raw.write(Integer.parseInt(withSpaces.substring(i + 1, i + 3), 16));
        i += 3;
      } else {
        byte[] bytes = String.valueOf(c).getBytes(StandardCharsets.UTF_8);
        raw.write(bytes, 0, bytes.length);
        i += 1;
      }
    }
    return new String(raw.toByteArray(), StandardCharsets.UTF_8);
  }

  private static boolean isHex(char c) {
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
  }
}
