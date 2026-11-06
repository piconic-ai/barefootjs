import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'One host nil standing for both `undefined` and `null`',
  given:
    'an operation whose JS result differs between `undefined` and `null` (`String` / template literal / `+`, `Number` / arithmetic, `===` against either, `JSON.stringify`, a destructure default, `includes` / `indexOf` on an array or a string, a numeric sort, an optional method argument, a `?.` result), over an omitted prop, an explicit `null` prop, a forwarded `undefined`, a literal `null` / `undefined`, or a missing row or object field',
  expected:
    '`undefined` and `null` are distinct values, so each renders its own JS result (`"undefined"` / `"null"`, `NaN` / `0`, a dropped member or no string / `null`, the default / `null`, the argument default / the coerced `null`)',
  actual:
    'renders the result for one of them in place of the other, or fails to render, since the host nil stands for both; graduates per target as its runtime carries `undefined` (`spec/js-undefined-value.md`)',
  fixtures: [
    'destructure-default-null-hydrate',
    'undef-null-array-search',
    'undef-null-destructure-default',
    'undef-null-json-stringify',
    'undef-null-json-stringify-object-member',
    'undef-null-number-coercion-typed',
    'undef-null-optional-chain-result',
    'undef-null-optional-method-args',
    'undef-null-row-field-coercion',
    'undef-null-sort',
    'undef-null-strict-equality',
    'undef-null-string-coercion',
    'undef-null-string-includes',
  ],
})
