package dev.barefootjs.pebble.eval;

/**
 * Thrown when a serialized {@code ParsedExpr} node uses a construct outside
 * the evaluator's pure-expression subset (the Java-runtime twin of the TS
 * reference's {@code EvalUnsupported} in
 * {@code packages/adapter-tests/vectors/eval-reference.ts}). The subset is
 * documented in {@code spec/compiler.md}, "ParsedExpr Evaluator Semantics".
 */
public class EvalUnsupported extends RuntimeException {
  public EvalUnsupported(String message) {
    super(message);
  }
}
