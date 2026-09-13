package dev.barefootjs.pebble;

import java.util.Set;

/**
 * Java-side twin of {@code packages/adapter-pebble/src/adapter/lib/pebble-naming.ts}'s
 * {@code pebbleIdent} — reserved-word identifier mangling for the per-render
 * {@code Map<String, Object>} context this runtime builds.
 *
 * <p>The compiled `.peb` template references a prop/signal/loop-variable
 * name through {@code pebbleIdent(name)} at EVERY bare-identifier site (see
 * that file's header). The context map this runtime builds (root vars in
 * {@code Main}, child vars in {@link Bf#render_child}) MUST key its entries
 * with the IDENTICAL mangling, or a reserved-word-named prop (`if`, `class`,
 * …) resolves to nothing at render time. The reserved-word SET here is a
 * byte-for-byte copy of the TS file's `RESERVED_WORDS` — any change to one
 * side must be mirrored on the other.
 */
final class PebbleIdent {

  private PebbleIdent() {}

  private static final Set<String> RESERVED_WORDS = Set.of(
      // Pebble tag / expression-grammar keywords.
      "if", "else", "elseif", "endif", "for", "endfor", "in", "is", "not", "and",
      "or", "true", "false", "null", "none", "set", "endset", "macro", "endmacro", "block",
      "endblock", "extends", "include", "import", "from", "as", "filter",
      "endfilter", "autoescape", "endautoescape", "verbatim", "endverbatim",
      "flush", "cache", "endcache", "parallel", "endparallel", "empty",
      // Java reserved words (full keyword list).
      "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
      "class", "const", "continue", "default", "do", "double", "enum",
      "final", "finally", "float", "goto", "implements",
      "instanceof", "int", "interface", "long", "native", "new",
      "package", "private", "protected", "public", "return", "short", "static",
      "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
      "transient", "try", "void", "volatile", "while", "var", "yield", "record",
      "sealed", "permits");

  /** Mangle a JS identifier into a Pebble-safe context-map key: reserved words get a trailing `_`. */
  static String mangle(String name) {
    return RESERVED_WORDS.contains(name) ? name + "_" : name;
  }
}
