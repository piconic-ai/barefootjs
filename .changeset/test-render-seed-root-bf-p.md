---
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
---

The `test-render` harnesses now seed the root component's `bf-p` hydration payload with the caller's props, the way a production route handler does (`$bf->_props($props)` in the Blade/PHP integrations, `render_root` in the Axum integration, `Render.renderRoot` in the Spring integration). Before, their SSR carried no `bf-p`, so a component whose client JS reads a prop could not hydrate from it. The payload is the caller's raw props, minus harness-only `__`-prefixed keys. For Pebble, the test CLI (`Main`) now hands those props to `Bf`'s existing `rootProps` constructor; for minijinja, the `bf-render` binary gains a `props` payload field that sets the root's `BfInstance::props`. Rendered HTML apart from `bf-p` is unchanged.
