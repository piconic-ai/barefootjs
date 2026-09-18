import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Forwarded text children of a child component inside a keyed loop row lose their SSR slot markers on hydration',
  given:
    'a keyed `.map()` row whose child component call receives parent-owned reactive text as `children` (`<TableRow><TableCell>{payment.id}</TableCell></TableRow>`)',
  expected: 'the server HTML and the hydrated DOM carry the same `<!--bf:^sN-->…<!--/-->` slot markers around the forwarded text',
  actual:
    'drops the markers: the row hydration effect rewrites each child root with `textContent` on its first run, so the hydrated cell holds a bare text node where the server HTML had the marker pair (the text itself is unchanged)',
  fixtures: ['data-table'],
})
