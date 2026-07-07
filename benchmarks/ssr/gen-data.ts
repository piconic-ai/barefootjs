/**
 * One-off data fixture generator for the SSR + hydration bench.
 *
 * `buildData()` uses `Math.random()` (krausest parity — see
 * benchmarks/apps/shared/data.ts), so calling it fresh on every bench run
 * would make react/solid/barefoot render *different* row contents each
 * time, defeating byte-equivalent comparison. Instead we generate the
 * 1,000-row workload exactly once and commit the result as `data.json`;
 * every framework's server render, client hydration, and build step reads
 * the same fixture.
 *
 * Re-run only if the fixture needs regenerating (e.g. row count changes):
 *   bun benchmarks/ssr/gen-data.ts
 */
import { buildData } from '../apps/shared/data.ts'

const OUT_PATH = new URL('./data.json', import.meta.url).pathname

async function main() {
  const rows = buildData(1000)
  await Bun.write(OUT_PATH, `${JSON.stringify(rows)}\n`)
  console.log(`Wrote ${rows.length} rows to ${OUT_PATH}`)
}

if (import.meta.main) {
  await main()
}
