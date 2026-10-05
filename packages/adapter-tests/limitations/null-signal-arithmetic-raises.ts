import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Arithmetic over a `null`-valued signal raises at render',
  given:
    'a memo or expression computing arithmetic over a signal whose SSR value is `null` (`createSignal<any>(null)`, `createMemo(() => s() * 2)`)',
  expected: 'JS coerces `null` to `0`, so the value renders `0`',
  actual:
    "throws at render: the template's native `*` rejects the nil operand (Jinja `None * 2`, ERB `nil * 2`, Pebble and MiniJinja reject the null multiplication), with no compile-time diagnostic",
  fixtures: ['nullish-signal-arithmetic-memo'],
})
