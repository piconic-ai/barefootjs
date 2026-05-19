// bf docs — show detailed component documentation.

import path from 'path'
import type { CliContext } from '../context'
import type { ComponentMeta } from '../lib/types'
import { formatMissingComponentError, tryLoadComponent } from '../lib/meta-loader'
import { resolveComponentSource } from '../lib/resolve-source'
import { extractMetaForFile } from './meta-extract'

function printComponent(meta: ComponentMeta, jsonFlag: boolean, banner?: string) {
  if (jsonFlag) {
    console.log(JSON.stringify(meta, null, 2))
    return
  }
  if (banner) {
    console.log(banner)
    console.log()
  }

  console.log(`# ${meta.title}`)
  console.log(`Category: ${meta.category} | Stateful: ${meta.stateful ? 'yes' : 'no'}`)
  if (meta.tags.length > 0) console.log(`Tags: ${meta.tags.join(', ')}`)
  console.log()
  console.log(meta.description)
  console.log()

  // Props
  if (meta.props.length > 0) {
    console.log('## Props')
    for (const p of meta.props) {
      const req = p.required ? ' (required)' : ''
      const def = p.default ? ` [default: ${p.default}]` : ''
      console.log(`  ${p.name}${req}: ${p.type}${def}`)
      if (p.description) console.log(`    ${p.description}`)
    }
    console.log()
  }

  // Sub-components
  if (meta.subComponents && meta.subComponents.length > 0) {
    console.log('## Sub-Components')
    for (const sub of meta.subComponents) {
      console.log(`  ${sub.name}`)
      if (sub.description) console.log(`    ${sub.description}`)
      for (const p of sub.props) {
        const def = p.default ? ` [default: ${p.default}]` : ''
        console.log(`    - ${p.name}: ${p.type}${def}`)
      }
    }
    console.log()
  }

  // Variants
  if (meta.variants) {
    console.log('## Variants')
    for (const [name, values] of Object.entries(meta.variants)) {
      console.log(`  ${name}: ${values.join(' | ')}`)
    }
    console.log()
  }

  // Examples
  if (meta.examples.length > 0) {
    console.log('## Examples')
    for (const ex of meta.examples) {
      console.log(`  ### ${ex.title}`)
      console.log('  ```tsx')
      for (const line of ex.code.split('\n')) {
        console.log(`  ${line}`)
      }
      console.log('  ```')
    }
    console.log()
  }

  // Accessibility
  if (meta.accessibility.role || meta.accessibility.ariaAttributes.length > 0) {
    console.log('## Accessibility')
    if (meta.accessibility.role) console.log(`  Role: ${meta.accessibility.role}`)
    if (meta.accessibility.ariaAttributes.length > 0) console.log(`  ARIA: ${meta.accessibility.ariaAttributes.join(', ')}`)
    if (meta.accessibility.dataAttributes.length > 0) console.log(`  Data: ${meta.accessibility.dataAttributes.join(', ')}`)
    console.log()
  }

  // Related
  if (meta.related.length > 0) {
    console.log(`## Related: ${meta.related.join(', ')}`)
    console.log()
  }

  console.log(`Source: ${meta.source}`)
}

export function run(args: string[], ctx: CliContext): void {
  const query = args.join(' ')
  if (!query) {
    console.error('Error: Component name required. Usage: bf docs <component>')
    process.exit(1)
  }

  // 1. Preferred path: meta JSON written by `bf meta extract` / `bf add`.
  const registryMeta = tryLoadComponent(ctx.metaDir, query)
  if (registryMeta) {
    printComponent(registryMeta, ctx.jsonFlag)
    return
  }

  // 2. Source-derived fallback for top-level page components
  //    (#1403). `bf meta extract` only scans `paths.components`, so
  //    user-authored components living under `sourceDirs`
  //    (`components/Counter.tsx` etc.) never get a persistent
  //    meta/<name>.json. Rebuild a minimal `ComponentMeta` on the fly
  //    via the same `extractMetaForFile` machinery `bf meta extract`
  //    uses for registry components, and mark it with the `page`
  //    category so the user can tell at a glance which path produced
  //    this output.
  const resolved = resolveComponentSource(query, ctx)
  if (resolved) {
    const { meta } = extractMetaForFile(
      resolved.filePath,
      ctx.projectDir ?? ctx.root,
      {},
    )
    // `extractMetaForFile` derives the component name from the parent
    // directory of the source file (correct for the registry layout
    // `<name>/index.tsx`, wrong for the flat `components/<Name>.tsx`
    // layout page components use — `fileToName(.../components/Counter.tsx)`
    // would return `'components'`). Use the query as the canonical
    // name since that's what the user typed in.
    const sourceDerivedMeta: ComponentMeta = {
      ...meta,
      name: query,
      title: query,
      category: 'page',
    }
    const rel = path.relative(ctx.projectDir ?? ctx.root, resolved.filePath)
    const banner = `(source-derived view of ${rel} — no registry meta. Run \`bf docs\` again after \`bf meta extract\` only if you've moved this file under \`paths.components\`.)`
    printComponent(sourceDerivedMeta, ctx.jsonFlag, banner)
    return
  }

  // 3. Hard error — neither meta nor source matches.
  for (const line of formatMissingComponentError(ctx.metaDir, query, ctx)) {
    console.error(line)
  }
  process.exit(1)
}
