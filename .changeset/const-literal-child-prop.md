---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

A module or component-local const holding a static array or object literal, passed whole as a child component prop (`<Kid xs={QS} />` beside `const QS = ['a', 'b']`), now reaches the child on every template adapter. Each one passes the literal as if the source had written it in place, where it used to hand the child an empty value. Hono and the client JS still pass the const itself, so the child keeps the const's identity. The IR records the literal on the prop (`ExpressionAttr.staticConstLiteral`), and `templatePropValue` is the one place that substitutes it.

An array of object literals passed as a child prop is refused with BF101 on every template adapter, also when a const holds it (that used to render the child empty). Go used to drop such a prop silently, even when written in place. The gap is registered as `object-array-literal-child-prop`.
