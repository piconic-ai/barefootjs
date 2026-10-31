package dev.barefootjs.pebble.ext;

import dev.barefootjs.pebble.JsValue;
import io.pebbletemplates.pebble.extension.AbstractExtension;
import io.pebbletemplates.pebble.node.expression.BinaryExpression;
import io.pebbletemplates.pebble.operator.Associativity;
import io.pebbletemplates.pebble.operator.BinaryOperator;
import io.pebbletemplates.pebble.operator.BinaryOperatorImpl;
import io.pebbletemplates.pebble.operator.BinaryOperatorType;
import io.pebbletemplates.pebble.template.EvaluationContextImpl;
import io.pebbletemplates.pebble.template.PebbleTemplateImpl;

import java.util.List;

/**
 * JS's value-position {@code l || r} / {@code l && r} as Pebble binary
 * operators (#3824). Pebble's own {@code or} / {@code and} coerce both
 * operands to Java booleans and yield a boolean, and its ternary needs a
 * boolean test, so neither can return the operand JS yields without
 * rendering {@code l} twice ({@code bf.truthy(l) ? l : r}), which makes a
 * chain {@code a || b || c …} grow exponentially. These operators evaluate
 * {@code l} once, test it by JS truthiness ({@link JsValue#truthy}), return
 * it when it decides the result, and evaluate {@code r} only otherwise (the
 * short circuit), so the template grows linearly.
 *
 * <p>The precedences match Pebble's {@code or} (10) and {@code and} (15), so
 * {@code ||} binds looser than {@code &&}, both looser than a comparison and
 * tighter than the ternary, as in JS. The adapter parenthesises every use
 * anyway. Registered beside {@link SetBlockExtension} in {@code Main}.
 */
public final class JsLogicalExtension extends AbstractExtension {

  /** JS {@code l || r}: {@code l} when JS-truthy, else {@code r}. */
  public static final class JsOrExpression extends BinaryExpression<Object> {
    @Override
    public Object evaluate(PebbleTemplateImpl self, EvaluationContextImpl context) {
      Object left = getLeftExpression().evaluate(self, context);
      return JsValue.truthy(left) ? left : getRightExpression().evaluate(self, context);
    }
  }

  /** JS {@code l && r}: {@code l} when JS-falsy, else {@code r}. */
  public static final class JsAndExpression extends BinaryExpression<Object> {
    @Override
    public Object evaluate(PebbleTemplateImpl self, EvaluationContextImpl context) {
      Object left = getLeftExpression().evaluate(self, context);
      return JsValue.truthy(left) ? getRightExpression().evaluate(self, context) : left;
    }
  }

  @Override
  public List<BinaryOperator> getBinaryOperators() {
    return List.of(
        new BinaryOperatorImpl("||", 10, JsOrExpression::new, BinaryOperatorType.NORMAL, Associativity.LEFT),
        new BinaryOperatorImpl("&&", 15, JsAndExpression::new, BinaryOperatorType.NORMAL, Associativity.LEFT));
  }
}
