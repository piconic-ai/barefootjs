import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Out-of-range controlled select: placeholder selected on the server, nothing selected after hydration',
  given: 'a controlled `<select value={...}>` with statically enumerable `<option>`s whose bound value matches none of them',
  expected: 'the server-rendered select and the hydrated select agree on the live selection (`selectedIndex` / `value`)',
  actual:
    'renders the hidden placeholder option selected (`selectedIndex` 0, `value` ""); the hydration controlled-value effect then assigns the out-of-range value, which the browser resolves to no selection (`selectedIndex` -1), so the live state changes across hydration although both read as blank',
  fixtures: ['select-out-of-range-hydration'],
})
