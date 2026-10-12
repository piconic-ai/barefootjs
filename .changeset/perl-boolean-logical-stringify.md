---
'@barefootjs/mojolicious': patch
'@barefootjs/xslate': patch
'@barefootjs/jsx': patch
---

A stringified `&&` / `||` whose operands are each a name declared `boolean` (a prop, signal or memo) or a boolean-shaped expression (`String(props.on && !props.off)`, `` `${props.off || props.on === true}` ``) now prints `true` / `false` on Mojolicious and Xslate instead of the native `1` Perl's last evaluated operand carries. `isBooleanResultParsed` takes an optional declared-`boolean` lookup, and the new `collectBooleanValueNames` builds it from a component's metadata; an operand that is not boolean (`props.name || 'x'`) keeps its value.
