import { XslateAdapter } from './src/adapter/xslate-adapter'
import { renderXslateComponent } from './src/test-render'
import { jsxFixtures } from '../adapter-tests/fixtures'
import { normalizeHTML, stripConditionalMarkersForCrossAdapter } from '../adapter-tests/src/jsx-runner'
for (const id of ['radio-group', 'accordion', 'tabs', 'dialog', 'popover', 'tooltip', 'select', 'dropdown-menu', 'combobox', 'command', 'pagination', 'data-table']) {
  const f = jsxFixtures.find(x => x.id === id)!
  try {
    const html = await renderXslateComponent({
      source: f.source, adapter: new XslateAdapter(), props: f.props ? structuredClone(f.props) : undefined,
      components: f.components, componentName: f.componentName,
    })
    const got = stripConditionalMarkersForCrossAdapter(normalizeHTML(html))
    const want = stripConditionalMarkersForCrossAdapter(normalizeHTML(f.expectedHtml!))
    if (got === want) { console.log(id, 'PARITY ✓'); continue }
    let i = 0
    while (i < Math.min(got.length, want.length) && got[i] === want[i]) i++
    console.log(id, `MISMATCH @${i} (${got.length} vs ${want.length})`)
    console.log('  WANT:', JSON.stringify(want.slice(i-30, i+90)))
    console.log('  GOT :', JSON.stringify(got.slice(i-30, i+90)))
  } catch (e: any) {
    console.log(id, 'ERROR:', (e.message ?? '').split('\n').filter((l:string)=>l.trim()).slice(0,2).join(' | ').slice(0, 160))
  }
}
