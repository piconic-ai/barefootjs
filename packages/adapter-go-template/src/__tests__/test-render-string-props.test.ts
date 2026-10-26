import { expect, test } from 'bun:test'
import { decodeEntities } from '@barefootjs/shared'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import { renderGoTemplateComponent } from '../test-render'

const values = ['plain', 'literal\\n', 'trailing\\', 'quote"', 'line\nfeed', 'tab\tstop', '${notCode}', '日本語🐾']
const cases = [
  {
    name: 'top-level array',
    source: `export function List(props: { values: string[] }) {
      return <ul>{props.values.map((value, i) => <li key={i}>{value}</li>)}</ul>
    }`,
    props: { values },
  },
  {
    name: 'array in a named object prop',
    source: `interface Group { values: string[] }
    export function List(props: { group: Group }) {
      return <ul>{props.group.values.map((value, i) => <li key={i}>{value}</li>)}</ul>
    }`,
    props: { group: { values } },
  },
]

for (const entry of cases) {
  test(`Go render harness preserves string data in ${entry.name}`, async () => {
    const html = await renderGoTemplateComponent({
      source: entry.source,
      adapter: new GoTemplateAdapter(),
      props: entry.props,
    })
    const text: string[] = []
    await new HTMLRewriter().on('li', {
      element() { text.push('') },
      text(chunk) { text[text.length - 1] += chunk.text },
    }).transform(new Response(html)).text()
    expect(text.map(decodeEntities)).toEqual(values)
  })
}
