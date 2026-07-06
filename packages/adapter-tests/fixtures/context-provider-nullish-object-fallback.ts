import { createFixture } from '../src/types'

/**
 * Context.Provider value whose object literal has a member falling back to
 * an EMPTY object literal via `??` — the exact shape the `chart` UI
 * component's `<ChartConfigContext.Provider value={{ config: props.config ??
 * {} }}>` needed (#2087). Before the relaxed `checkSupport` gate
 * (expression-parser.ts, `logical` case), `props.config ?? {}` refused with
 * BF101 on every SSR template adapter — the `object-literal` fallback
 * operand hard-refused the whole expression even though every adapter's
 * `??` lowering already had a correct definedness test.
 *
 * `props.config` is intentionally omitted from `props` below so the
 * fallback actually engages: `config` lowers to the real empty dict/hashref
 * each adapter's template language natively supports, and the consumer reads
 * a missing key off it (`ctx.config.label ?? 'none'`) — proving the
 * coalesced value is a genuine empty map (member access on it resolves to
 * "not found" and falls through to the second `??`) rather than a leftover
 * sentinel string. (An earlier draft of this fixture asserted
 * `JSON.stringify(ctx.config)` instead, but that diverges cross-adapter for
 * reasons unrelated to this fix — PHP's `json_encode` renders an empty PHP
 * array as `[]`, not `{}`, so Twig's `JSON.stringify({})` prints `[]` while
 * every other backend prints `{}`. Reading a key off the dict sidesteps
 * that unrelated JSON-encoding ambiguity entirely.)
 */
export const fixture = createFixture({
  id: 'context-provider-nullish-object-fallback',
  description: 'Context.Provider value member falls back to an empty object literal via `?? {}` (#2087)',
  source: `
'use client'
import { createContext, useContext } from '@barefootjs/client'

type ChartConfig = Record<string, string>

const ChartConfigContext = createContext<{ config: ChartConfig }>({ config: {} })

function ConfigConsumer() {
  const ctx = useContext(ChartConfigContext)
  return <span class="config">{ctx.config.label ?? 'none'}</span>
}

type Props = {
  config?: ChartConfig
}

export function ChartConfigRoot(props: Props) {
  return (
    <div class="root">
      <ChartConfigContext.Provider value={{ config: props.config ?? {} }}>
        <ConfigConsumer />
      </ChartConfigContext.Provider>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" class="root"><span bf-s="test_s0" class="config">none</span></div>
  `,
})
