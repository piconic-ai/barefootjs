// bf tokens — list design tokens by category.
//
// Token resolution (user → monorepo → bundled default) lives in
// `../lib/tokens`, shared with `bf preview`.

import type { CliContext } from '../context'
import { loadTokenSet, type TokenSet, type Token, type ColorToken } from '../lib/tokens'

type CategoryName = 'typography' | 'spacing' | 'borderRadius' | 'transitions' | 'layout' | 'colors' | 'shadows'

const CATEGORY_NAMES: CategoryName[] = [
  'typography', 'spacing', 'borderRadius', 'transitions', 'layout', 'colors', 'shadows',
]

function flattenTokens(tokenSet: TokenSet, category?: CategoryName): Token[] {
  const result: Token[] = []

  function add(cat: CategoryName, tokens: Token[]) {
    if (category && category !== cat) return
    result.push(...tokens)
  }

  add('typography', [...tokenSet.typography.fontFamily, ...tokenSet.typography.letterSpacing])
  add('spacing', tokenSet.spacing)
  add('borderRadius', tokenSet.borderRadius)
  add('transitions', [...tokenSet.transitions.duration, ...tokenSet.transitions.easing])
  add('layout', tokenSet.layout)
  add('colors', tokenSet.colors)
  add('shadows', tokenSet.shadows)

  return result
}

function printTokens(tokens: Token[], jsonFlag: boolean) {
  if (jsonFlag) {
    console.log(JSON.stringify(tokens, null, 2))
    return
  }

  if (tokens.length === 0) {
    console.log('No tokens found.')
    return
  }

  const nameWidth = Math.max(25, ...tokens.map(t => t.name.length + 4))
  const header = `${'NAME'.padEnd(nameWidth)}VALUE`
  console.log(header)
  console.log('-'.repeat(header.length + 20))

  for (const t of tokens) {
    const name = `--${t.name}`
    const dark = (t as ColorToken).dark
    const darkSuffix = dark ? `  (dark: ${dark})` : ''
    console.log(`${name.padEnd(nameWidth)}${t.value}${darkSuffix}`)
  }
  console.log(`\n${tokens.length} token(s)`)
}

export async function run(args: string[], ctx: CliContext): Promise<void> {
  // Parse --category flag
  let category: CategoryName | undefined
  const catIdx = args.indexOf('--category')
  if (catIdx >= 0 && args[catIdx + 1]) {
    const val = args[catIdx + 1] as CategoryName
    if (!CATEGORY_NAMES.includes(val)) {
      console.error(`Unknown category: ${val}`)
      console.error(`Available: ${CATEGORY_NAMES.join(', ')}`)
      process.exit(1)
    }
    category = val
  }

  const tokenSet = await loadTokenSet(ctx)
  const tokens = flattenTokens(tokenSet, category)
  printTokens(tokens, ctx.jsonFlag)
}
