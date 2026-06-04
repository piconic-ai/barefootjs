'use client'

import { createSignal, createMemo } from '@barefootjs/client'
import { Button } from '@/components/ui/button'

interface CounterProps {
  initial?: number
}

// Default app — exercises the pre-compiled ui.barefootjs.dev registry: the +1 /
// -1 / Reset controls are real <Button> registry components (themed via the
// semantic tokens), so the registry SSR + hydration path is proven by the
// out-of-the-box preview, not just by AI-generated apps.
export function Counter(props: CounterProps) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold tracking-tight">Counter</h2>
      <p className="mt-1 text-sm text-muted-foreground">A signal-based counter, server-rendered and hydrated.</p>

      <div className="mt-6 flex flex-col items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 py-8">
        <span className="text-6xl font-semibold tracking-tight tabular-nums" data-testid="count">{count()}</span>
        <span className="text-sm text-muted-foreground">doubled: {doubled()}</span>
      </div>

      <div className="mt-6 flex gap-3">
        <Button variant="default" onClick={() => setCount((n) => n + 1)}>+1</Button>
        <Button variant="outline" onClick={() => setCount((n) => n - 1)}>-1</Button>
        <Button variant="ghost" className="ml-auto" onClick={() => setCount(0)}>Reset</Button>
      </div>

      <a className="mt-6 inline-block text-sm font-medium text-indigo-600 no-underline transition-colors hover:text-indigo-500" href="/">← Home</a>
    </div>
  )
}

export default Counter
