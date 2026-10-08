import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Arithmetic over an `undefined`-valued signal does not render `NaN`',
  given:
    'a memo or expression computing arithmetic over a signal whose SSR value is `undefined` (`createSignal<any>(undefined)`, `createMemo(() => s() * 2)`)',
  expected: 'JS `ToNumber(undefined)` is `NaN`, so the value renders `NaN`',
  actual:
    "renders without `NaN`: the template engine holds `undefined` as the same nil as `null`, so ERB, Jinja, Pebble and MiniJinja throw at render on the nil operand, and Mojolicious, Xslate, go-template, Twig and Blade read it as `0` and render `0`",
  fixtures: ['undefined-signal-arithmetic-memo'],
})
