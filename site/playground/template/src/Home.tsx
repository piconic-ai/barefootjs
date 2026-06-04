// The home page — a purely static page (no signals or events), so it ships
// zero client JS and needs no 'use client' directive. Just a landing header and
// navigation cards to the demo routes.
export function Home() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          BarefootJS · Hono · UnoCSS
        </span>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">BarefootJS Playground</h1>
        <p className="text-base text-slate-500">
          A multi-route Hono app, server-rendered and hydrated live inside a
          Cloudflare Dynamic Worker. Pick a demo to explore.
        </p>
      </header>

      <ul className="flex list-none flex-col gap-3 p-0">
        <li>
          <a
            className="group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50"
            href="/counter"
          >
            <span className="flex flex-col gap-1">
              <span className="text-base font-medium text-slate-900">Counter</span>
              <span className="text-sm text-slate-500">A signal-based counter with derived state.</span>
            </span>
            <span className="text-slate-400 transition-colors group-hover:text-indigo-600">→</span>
          </a>
        </li>
      </ul>
    </div>
  )
}

export default Home
