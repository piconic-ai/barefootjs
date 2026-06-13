/**
 * Runtime-cost microbenchmark — motivation for an IR-driven router.
 *
 * Today the router does two things whose cost scales with the *whole
 * document*, not with what actually changed on a navigation:
 *
 *   1. Re-hydration walks the entire document. `rehydrateAll()` →
 *      `document.createTreeWalker(document, SHOW_ELEMENT|SHOW_COMMENT)`
 *      visits every node on every swap (see
 *      packages/client/src/runtime/hydrate.ts).
 *   2. The zero-cooperation path parses the entire response document
 *      client-side with `DOMParser` to extract `[bf-outlet]`.
 *
 *   Neither depends on how many islands the swap introduced. A page with
 *   a big shell (nav, sidebar, footer) pays for all of it on every
 *   navigation.
 *
 * This bench builds documents with a growing shell and a fixed outlet,
 * and compares the current "whole document" cost against an IR-scoped
 * "outlet subtree only" cost — the cost an IR-derived router would pay.
 *
 * Run: `bun run bench.ts` (no browser needed; uses happy-dom).
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (typeof window === 'undefined') GlobalRegistrator.register({ url: 'https://example.test/' })

const OUTLET_ISLANDS = 8 // fixed: what actually swaps on a navigation
const REPEAT = 200

function buildDoc(shellNodes: number): string {
  // A shell of N filler nodes (nav/sidebar/footer chrome) that is IDENTICAL
  // across navigations, plus an outlet with a fixed set of islands.
  const shell = Array.from(
    { length: shellNodes },
    (_, i) => `<div class="chrome"><span>item ${i}</span><a href="/x/${i}">link</a></div>`,
  ).join('')
  const islands = Array.from(
    { length: OUTLET_ISLANDS },
    (_, i) =>
      `<div bf-s="Island_${i}"><!--bf-scope:Inner_${i}--><p bf="s0">island ${i}</p></div>`,
  ).join('')
  return `<!doctype html><html><head><title>bench</title></head><body>
    <header class="shell">${shell}</header>
    <main bf-outlet>${islands}</main>
  </body></html>`
}

/** Count bf-s scopes via a TreeWalker over `root` — models the hydration walk. */
function walkScopes(root: Node): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT)
  let n = 0
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute('bf-s')) n++
    else if (node.nodeType === Node.COMMENT_NODE && (node as Comment).data.startsWith('bf-scope:')) n++
  }
  return n
}

function time(fn: () => void): number {
  const t0 = performance.now()
  for (let i = 0; i < REPEAT; i++) fn()
  return (performance.now() - t0) / REPEAT
}

function fragmentOf(fullHtml: string): string {
  const i = fullHtml.indexOf('<main bf-outlet>')
  const j = fullHtml.indexOf('</main>') + '</main>'.length
  return fullHtml.slice(i, j)
}

const shellSizes = [50, 200, 1000, 4000]

console.log(`\nRuntime cost per navigation (avg of ${REPEAT}), outlet fixed at ${OUTLET_ISLANDS} islands`)
console.log('shell nodes | full-doc walk | outlet-only walk | full parse | fragment parse')
console.log('-'.repeat(78))

for (const shell of shellSizes) {
  const html = buildDoc(shell)
  const frag = fragmentOf(html)

  // Parse once to get a live document/outlet for the walk benchmarks.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const outlet = doc.querySelector('[bf-outlet]')!

  const fullWalk = time(() => walkScopes(doc))
  const outletWalk = time(() => walkScopes(outlet))
  const fullParse = time(() => new DOMParser().parseFromString(html, 'text/html'))
  const fragParse = time(() => new DOMParser().parseFromString(frag, 'text/html'))

  const fmt = (n: number) => `${n.toFixed(3)}ms`.padStart(13)
  console.log(
    `${String(shell).padStart(11)} |${fmt(fullWalk)} |${fmt(outletWalk).padStart(17)} |${fmt(fullParse).padStart(11)} |${fmt(fragParse).padStart(15)}`,
  )
}

console.log(`
Reading:
- "full-doc walk" grows with the shell; "outlet-only walk" stays flat — the
  hydration walk cost is O(document) today but could be O(outlet) if the
  router knew which subtree to hydrate (it does, at compile time).
- "full parse" vs "fragment parse": parsing the whole response client-side
  costs more than parsing just the outlet. This is a CLIENT-side win — the
  router could extract the outlet substring on the known marker instead of
  DOMParsing the whole document. It is NOT an argument for a server
  fragment (that hurts cache efficiency; see DESIGN.md §5.4).
`)
