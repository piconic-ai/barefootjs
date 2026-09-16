package dev.barefootjs.pebble.ext;

import io.pebbletemplates.pebble.extension.NodeVisitor;
import io.pebbletemplates.pebble.extension.escaper.SafeString;
import io.pebbletemplates.pebble.node.AbstractRenderableNode;
import io.pebbletemplates.pebble.node.BodyNode;
import io.pebbletemplates.pebble.node.Node;
import io.pebbletemplates.pebble.template.EvaluationContextImpl;
import io.pebbletemplates.pebble.template.PebbleTemplateImpl;

import java.io.IOException;
import java.io.StringWriter;
import java.io.Writer;

/**
 * `{% set NAME %}...{% endset %}` block-capture (BarefootJS #2101 Phase 3b).
 *
 * <p>Stock Pebble's own {@code SetNode}
 * ({@code io.pebbletemplates.pebble.node.SetNode}) only ever binds NAME to
 * the evaluated value of a single expression
 * ({@code {% set NAME = EXPRESSION %}}) — there is no block-capture form the
 * way Jinja/Twig's {@code {% set NAME %}...{% endset %}} renders a template
 * FRAGMENT and binds NAME to the resulting string (confirmed absent from
 * Pebble's grammar during Phase 3a's research — see the adapter package
 * README, "Divergence 6"). This node supplies exactly that: it renders
 * {@link #body} to an in-memory buffer and binds NAME to the resulting
 * {@link String} in the current scope, so downstream {@code {{ NAME }}} /
 * helper-call references ({@code bf.render_child(..., {'default': NAME})},
 * {@code bf.async_boundary(id, NAME)}) see it as an ordinary Pebble
 * variable. {@link SetBlockTokenParser} is the only thing that constructs
 * this node.
 *
 * <p>Binds NAME to a {@link SafeString}, not a plain {@link String} —
 * mirrors Jinja2's OWN `{% set NAME %}...{% endset %}` block form, which
 * auto-marks its captured content `Markup`-safe under autoescape (and
 * minijinja's/Twig's equivalent safe-value handling). This matters the
 * moment the captured value crosses into a DIFFERENTLY-scoped template's
 * plain variable reference — e.g. `bf.render_child`'s `children` prop,
 * referenced by the child template as a bare `{{ bf.string(children) }}`
 * with no `| raw` (the shape `<div>{children}</div>` compiles to): without
 * this, Pebble's `EscapeFilter` (which recognizes `SafeString` and skips
 * escaping ONLY when the print statement's value IS one) would silently
 * double-HTML-escape every forwarded child/named-slot/async-fallback
 * capture. `Bf.string(Object)` passes a `SafeString` input through
 * unchanged for exactly this reason — see its own doc comment.
 */
public final class SetBlockNode extends AbstractRenderableNode {

  private final String name;
  private final BodyNode body;

  public SetBlockNode(int lineNumber, String name, BodyNode body) {
    super(lineNumber);
    this.name = name;
    this.body = body;
  }

  @Override
  public void render(PebbleTemplateImpl self, Writer writer, EvaluationContextImpl context) throws IOException {
    StringWriter captured = new StringWriter();
    body.render(self, captured, context);
    context.getScopeChain().set(name, new SafeString(captured.toString()));
  }

  @Override
  public void accept(NodeVisitor visitor) {
    // No `visit(SetBlockNode)` overload exists on the core `NodeVisitor`
    // interface (it only knows Pebble's own built-in node types) — casting
    // to the generic `Node` type so the call resolves to `visit(Node)` is
    // the documented pattern for a custom extension's node type (Pebble
    // wiki's "Extending Pebble" guide worked custom-tag example).
    visitor.visit((Node) this);
  }
}
