import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A JSX prop that reads the loop row, on a component in that row',
  given:
    'a JSX-valued prop other than `children` whose JSX reads the loop row (`header={<i>{x}</i>}`), on a component nested in the row\'s element (`items.map((x) => <li><Head header={<i>{x}</i>} /></li>)`) or returned as the row (`items.map((x) => <Head key={x} header={<i>{x}</i>} />)`), including one a later `{...props}` replaces only when the caller passes its optional key',
  expected: 'each row\'s component receives its row\'s JSX, rendered directly or read into state (`<h2><i>a</i></h2>`)',
  diagnostic: 'BF101',
  fixtures: [
    'jsx-prop-loop-row-element-dynamic',
    'jsx-prop-loop-row-component-dynamic',
    'jsx-prop-loop-row-element-spread-optional',
    'jsx-prop-loop-row-component-spread-optional',
  ],
})
