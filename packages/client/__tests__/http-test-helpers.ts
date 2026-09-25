/**
 * Fetch stubs and async-settling helpers shared by `create-query.test.ts`
 * and `create-mutation.test.ts` — both factories are exercised the same way
 * (stub or defer `globalThis.fetch`, then wait for signals to settle), so
 * this is the one implementation both suites call rather than two copies
 * that happen to agree today (CLAUDE.md's "one decision, two
 * implementations" rule).
 */

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Every call resolves immediately with `body`; `calls` records the URLs sent. */
export function stubFetch(body: unknown, status = 200): { calls: string[] } {
  const calls: string[] = []
  // @ts-expect-error — test stub
  globalThis.fetch = (url: string) => {
    calls.push(url)
    return Promise.resolve(jsonResponse(body, status))
  }
  return { calls }
}

/** Calls are recorded but resolve only when `resolveNth` is invoked. */
export function deferredFetch(): {
  calls: string[]
  resolveNth: (n: number, body: unknown, status?: number) => void
} {
  const calls: string[] = []
  const resolvers: Array<(r: Response) => void> = []
  // @ts-expect-error — test stub
  globalThis.fetch = (url: string) => {
    calls.push(url)
    return new Promise<Response>((resolve) => {
      resolvers.push(resolve)
    })
  }
  return {
    calls,
    resolveNth(n, body, status = 200) {
      resolvers[n]!(jsonResponse(body, status))
    },
  }
}

export async function waitUntil(predicate: () => boolean, maxIters = 200): Promise<void> {
  for (let i = 0; i < maxIters; i++) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new Error(`waitUntil: condition not met after ${maxIters} microtask ticks`)
}

export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
