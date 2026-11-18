---
"@barefootjs/jsx": patch
---

A `Date` prop declared on a base interface (`interface Props extends Base`) or an intersection constituent (`type Props = Base & { ... }`) is now seen by the date lowering. Before, `props.at.getUTCFullYear()` rendered an empty string without any diagnostic on the mojolicious, xslate, jinja, erb, pebble and rust adapters, and failed at render time on go-template. When the props type inherits from a base that is not declared in the file, a catalogued `Date` method called on a prop the file cannot see is refused with BF021 instead of rendering empty. Intersection members are combined per member, independent of arm order (`Base & { at: Date }` with `Base.at: unknown` works in either order), parenthesized and nested intersection arms count, and irreconcilable declarations of a Date-method receiver are refused. A lowering plugin that claims the call is honoured before the refusal.
