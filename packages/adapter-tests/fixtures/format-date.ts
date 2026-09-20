import { createFixture } from '../src/types'

/**
 * An AUTHORED call to `formatDate` imported by name from `@barefootjs/client`
 * (#3089, BF056). `formatDate` is compiler ABI — the lowering TARGET the
 * `.toLocaleDateString(locale, { timeZone, ... })` sugar rewrites to
 * (`to-locale-date-lowering.ts`), emitted by the compiler itself — never an
 * authored API. This used to lower silently through the (now-removed)
 * `formatDatePlugin`, same as the sanctioned sugar form; now it is refused
 * loudly at compile time, uniformly on every adapter including Hono (a
 * POLICY decision, not a per-adapter capability gap — see
 * `format-date-refusal.ts`'s doc comment).
 *
 * Also covers the ternary-consequent shape the retired `format-date-ternary`
 * fixture used to pin (`title={ok ? formatDate(...) : 'n/a'}`) — BF056's
 * walk parses a structured template part's `whenTrue`/`whenFalse` text on
 * demand, same as `condition`/`key`, so the call is caught there too.
 *
 * `escapes` twin: `format-date-client` — the same calls deferred to the
 * client with `/* @client *\/`.
 */
export const fixture = createFixture({
  id: 'format-date',
  description: 'An authored formatDate(...) call refuses with BF056 on every adapter',
  source: `
import { formatDate } from '@barefootjs/client'

function FormatDateFixture({ ok, createdAt }: { ok: boolean; createdAt: Date }) {
  return (
    <div>
      <time>{formatDate(createdAt, 'YYYY-MM-DD')}</time>
      <span title={ok ? formatDate(createdAt, 'YYYY-MM-DD') : 'n/a'}>x</span>
    </div>
  )
}
export { FormatDateFixture }
`,
  props: { ok: true, createdAt: new Date('2024-01-01T23:00:00.000Z') },
  escapes: [{ kind: 'client-directive', fixture: 'format-date-client' }],
})
