package dev.barefootjs.integrations.spring.controller;

import dev.barefootjs.integrations.spring.BfContext;
import dev.barefootjs.integrations.spring.Layout;
import dev.barefootjs.integrations.spring.Render;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * The component-demo routes with no per-visitor state — mirrors
 * `integrations/axum/src/main.rs`'s `counter_route` / `toggle_route` /
 * `form_route` / `portal_route` / `reactive_props_route` /
 * `props_reactivity_route` / `render_conditional_return`. Same
 * props/stash literal shapes as that file — see its docstring for why this
 * app doesn't ALSO need Flask-style manual `children={...}` wiring per
 * route.
 */
@RestController
public class DemoController {
  private final BfContext ctx;

  public DemoController(BfContext ctx) {
    this.ctx = ctx;
  }

  @GetMapping("${app.base-path}/counter")
  public ResponseEntity<String> counter() {
    return renderPage("Counter", Render.emptyObj(), Render.emptyObj(), "Counter - BarefootJS", "Counter Component");
  }

  @GetMapping("${app.base-path}/toggle")
  public ResponseEntity<String> toggle() {
    List<Object> items = Render.arr(
        Render.obj("label", "Setting 1", "defaultOn", true),
        Render.obj("label", "Setting 2", "defaultOn", false),
        Render.obj("label", "Setting 3", "defaultOn", false));
    Map<String, Object> props = Render.obj("toggleItems", items);
    Map<String, Object> stash = Render.obj("toggleItems", items);
    return renderPage("Toggle", props, stash, "Toggle - BarefootJS", "Toggle Component");
  }

  @GetMapping("${app.base-path}/form")
  public ResponseEntity<String> form() {
    return renderPage("Form", Render.emptyObj(), Render.obj("accepted", false), "Form - BarefootJS", "Form Example");
  }

  @GetMapping("${app.base-path}/portal")
  public ResponseEntity<String> portal() {
    return renderPage("PortalExample", Render.emptyObj(), Render.obj("open", false), "Portal - BarefootJS", "Portal Example");
  }

  @GetMapping("${app.base-path}/reactive-props")
  public ResponseEntity<String> reactiveProps() {
    Map<String, Object> stash = Render.obj("count", 0.0, "doubled", 0.0);
    return renderPage("ReactiveProps", Render.emptyObj(), stash, "Reactive Props - BarefootJS", "Reactive Props Test");
  }

  /**
   * Not in the headline route list, but required: the shared
   * `reactive-props.spec.ts` suite's "Props Access" describe block
   * navigates to `${baseUrl}/props-reactivity` — see
   * `integrations/shared/e2e/reactive-props.spec.ts`.
   */
  @GetMapping("${app.base-path}/props-reactivity")
  public ResponseEntity<String> propsReactivity() {
    Map<String, Object> stash = Render.obj("count", 1.0);
    return renderPage("PropsReactivityComparison", Render.emptyObj(), stash, "Props Reactivity - BarefootJS", "Props Reactivity Comparison");
  }

  @GetMapping("${app.base-path}/conditional-return")
  public ResponseEntity<String> conditionalReturn() {
    return renderConditionalReturn("");
  }

  @GetMapping("${app.base-path}/conditional-return-link")
  public ResponseEntity<String> conditionalReturnLink() {
    return renderConditionalReturn("link");
  }

  private ResponseEntity<String> renderConditionalReturn(String variant) {
    Map<String, Object> props = Render.obj("variant", variant);
    Map<String, Object> stash = Render.obj("variant", variant, "count", 0.0);
    String heading = variant.isEmpty() ? "Conditional Return Example" : "Conditional Return Example (Link)";
    String title = variant.isEmpty() ? "Conditional Return - BarefootJS" : "Conditional Return (Link) - BarefootJS";
    return renderPage("ConditionalReturn", props, stash, title, heading);
  }

  private ResponseEntity<String> renderPage(
      String component, Map<String, Object> props, Map<String, Object> stash, String title, String heading) {
    try {
      Render.Rendered rendered = Render.renderComponent(ctx, component, props, stash);
      return Layout.htmlResponseCached(Layout.render(ctx, new Layout.Opts()
          .title(title)
          .heading(heading)
          .body(rendered.body())
          .scripts(rendered.scripts())
          .portals(rendered.portals())));
    } catch (IOException e) {
      return Layout.renderError(e);
    }
  }
}
