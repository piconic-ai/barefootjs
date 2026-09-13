package dev.barefootjs.pebble.ext;

import io.pebbletemplates.pebble.error.ParserException;
import io.pebbletemplates.pebble.lexer.Token;
import io.pebbletemplates.pebble.lexer.TokenStream;
import io.pebbletemplates.pebble.node.BodyNode;
import io.pebbletemplates.pebble.node.RenderableNode;
import io.pebbletemplates.pebble.node.SetNode;
import io.pebbletemplates.pebble.node.expression.Expression;
import io.pebbletemplates.pebble.parser.Parser;
import io.pebbletemplates.pebble.tokenParser.TokenParser;

/**
 * Replaces stock Pebble's {@code SetTokenParser} for the {@code set} tag
 * (BarefootJS #2101 Phase 3b, registered via {@link SetBlockExtension}).
 *
 * <p>{@code ExtensionRegistry.addExtension} resolves a duplicate tag name by
 * later-registered-wins {@code Map.put} (confirmed by decompiling
 * {@code ExtensionRegistry}/{@code ExtensionRegistryFactory}: {@code
 * CoreExtension} — the owner of the stock {@code set} tag — is registered
 * FIRST, user-provided extensions afterward, into the SAME
 * {@code Map<String, TokenParser>} keyed by tag name), so once
 * {@link SetBlockExtension} is installed, this class is the ONLY entry point
 * for {@code set} — it must therefore still parse stock Pebble's own
 * {@code {% set NAME = EXPRESSION %}} assignment form, not just the new
 * block-capture one.
 *
 * <p>Grammar: after {@code NAME}, the very next token disambiguates the two
 * forms — {@code =} starts an assignment expression (delegates to the same
 * {@code Expression<?>} parse + {@link SetNode} stock Pebble itself builds);
 * an immediately-closing {@code %}} starts a block-capture body, read up to
 * a matching {@code {% endset %}} via {@code Parser#subparse}, exactly
 * mirroring how {@code BlockTokenParser} reads a
 * {@code {% block %}...{% endblock %}} body. Nested
 * {@code {% set %}...{% endset %}} blocks are handled for free:
 * {@code subparse} dispatches every {@code {% ... %}} tag it encounters —
 * including a nested {@code set} — back through the ordinary tag-parser
 * lookup, so a nested block fully consumes its own {@code endset} before
 * this level's stopping condition is ever re-checked against the token
 * stream.
 */
public final class SetBlockTokenParser implements TokenParser {

  private static final String ENDSET = "endset";

  @Override
  public RenderableNode parse(Token token, Parser parser) {
    TokenStream stream = parser.getStream();
    int lineNumber = token.getLineNumber();
    stream.next(); // consume "set"

    String name = parser.getExpressionParser().parseNewVariableName();

    if (stream.current().test(Token.Type.EXECUTE_END)) {
      return parseBlockForm(lineNumber, name, stream, parser);
    }

    stream.expect(Token.Type.PUNCTUATION, "=");
    Expression<?> value = parser.getExpressionParser().parseExpression();
    stream.expect(Token.Type.EXECUTE_END);
    return new SetNode(lineNumber, name, value);
  }

  private RenderableNode parseBlockForm(int lineNumber, String name, TokenStream stream, Parser parser) {
    stream.next(); // consume "%}"

    BodyNode body = parser.subparse(t -> t.test(Token.Type.NAME, ENDSET));

    Token endToken = stream.current();
    if (!endToken.test(Token.Type.NAME, ENDSET)) {
      throw new ParserException(null,
          "An 'endset' tag was expected to close the '{% set " + name + " %}' block",
          lineNumber, stream.getFilename());
    }
    stream.next(); // consume "endset"
    stream.expect(Token.Type.EXECUTE_END);

    return new SetBlockNode(lineNumber, name, body);
  }

  @Override
  public String getTag() {
    return "set";
  }
}
