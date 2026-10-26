import { expect, test } from 'bun:test'
import { decodeEntities } from '@barefootjs/shared'
import { MojoAdapter } from '../adapter/mojo-adapter'
import { renderMojoComponent } from '../test-render'

const value = "two\\\\slashes|trailing\\|quote'|before\\'after|line\nfeed|tab\tstop|$notCode|日本語🐾"
const cases = [
  { name: 'extra supplied prop', extra: true, source: 'export function Text(props: { value: string }) { return <p>{props.value}</p> }' },
  { name: 'record props-object access', source: 'export function Text(props: Record<string, string>) { return <p>{props.value}</p> }' },
  { name: 'props-object access', source: 'export function Text(props: { value: string }) { return <p>{props.value}</p> }' },
  { name: 'destructured prop', source: 'export function Text({ value }: { value: string }) { return <p>{value}</p> }' },
]

for (const entry of cases) {
  test(`Mojo render harness preserves string data through ${entry.name}`, async () => {
    const html = await renderMojoComponent({ source: entry.source, adapter: new MojoAdapter(), props: 'extra' in entry ? { value, extra: value } : { value } })
    let text = ''
    await new HTMLRewriter().on('p', { text(chunk) { text += chunk.text } }).transform(new Response(html)).text()
    expect(decodeEntities(text)).toBe(value)
  })
}
