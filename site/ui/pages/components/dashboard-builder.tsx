/**
 * Dashboard Builder Reference Page (/components/dashboard-builder)
 *
 * Block-level composition pattern: dynamic widget composition with
 * per-widget signal isolation, dynamic component switching inside a
 * loop, and layout memo dependent on widget count.
 */

import { DashboardBuilderDemo } from '@/components/dashboard-builder-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
]

const previewCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/client'

// Each widget type is its own client component with its own signal scope.
// Two StatWidget instances each maintain independent value/trend signals —
// incrementing one does not touch the other.

function StatWidget(props: { initialValue: number; step: number }) {
  const [value, setValue] = createSignal(props.initialValue)
  const delta = createMemo(() => value() - props.initialValue)
  return (
    <div>
      <div>{value()}</div>
      <button onClick={() => setValue(value() + props.step)}>+</button>
    </div>
  )
}

function ProgressWidget(props: { initialProgress: number }) {
  const [progress, setProgress] = createSignal(props.initialProgress)
  // ...own bar + status memos
}

function TodoWidget() { /* own todos signal */ }
function ChartWidget(props: { initialBars: ChartBar[] }) { /* own bars + selectedIndex */ }

type WidgetConfig = { id: number; type: 'stat' | 'progress' | 'todo' | 'chart'; title: string; size: 'sm' | 'md' | 'lg' }

function DashboardBuilder() {
  const [widgets, setWidgets] = createSignal<WidgetConfig[]>(initialWidgets)

  // Layout memo: grid column class recomputed whenever widgets are added/removed
  const gridCols = createMemo(() => {
    const n = widgets().length
    if (n <= 1) return 'grid-cols-1'
    if (n === 2) return 'grid-cols-1 md:grid-cols-2'
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
  })

  return (
    <div className={\`grid gap-3 \${gridCols()}\`}>
      {widgets().map(w => (
        <div key={w.id} className="widget-cell">
          {/* Dynamic component switching inside the loop body */}
          {w.type === 'stat' ? <StatWidget initialValue={...} step={...} /> : null}
          {w.type === 'progress' ? <ProgressWidget initialProgress={35} /> : null}
          {w.type === 'todo' ? <TodoWidget /> : null}
          {w.type === 'chart' ? <ChartWidget initialBars={...} /> : null}
        </div>
      ))}
    </div>
  )
}`

export function DashboardBuilderRefPage() {
  return (
    <DocPage slug="dashboard-builder" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Dashboard Builder"
          description="Dynamic widget composition where each widget owns its own signal scope. Add, remove, reorder, and resize heterogeneous widgets; the layout grid reconfigures from a memo driven by widget count."
          {...getNavLinks('dashboard-builder')}
        />

        <Section id="preview" title="Preview">
          <Example title="" code={previewCode}>
            <DashboardBuilderDemo />
          </Example>
        </Section>

        <Section id="features" title="Features">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Per-Widget Signal Isolation</h3>
              <p className="text-sm text-muted-foreground">
                Each widget type (Stat, Progress, Todo, Chart) is a separate client
                component with its own signal scope. Adding a second StatWidget creates
                an entirely new reactive instance — its value signal, trend memo, and
                DOM bindings are independent of every other StatWidget on the page.
                Incrementing one StatWidget does not invalidate memos in sibling widgets.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Dynamic Component Switching Inside .map()</h3>
              <p className="text-sm text-muted-foreground">
                The widget loop body renders a different child component based on
                <code className="mx-1 text-xs">w.type</code>. A ternary chain returns
                <code className="mx-1 text-xs">StatWidget</code>, <code className="mx-1 text-xs">ProgressWidget</code>,
                <code className="mx-1 text-xs">TodoWidget</code>, or <code className="mx-1 text-xs">ChartWidget</code>.
                Each branch produces a structurally different subtree — the compiler must
                hydrate the right component per item and wire up its independent signal tree.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Layout Memo Dependent on Widget Count</h3>
              <p className="text-sm text-muted-foreground">
                <code className="mr-1 text-xs">gridCols</code> memo reads
                <code className="mx-1 text-xs">widgets().length</code> and emits a
                responsive Tailwind grid class. Adding or removing widgets updates
                the memo, which updates the container's className via a reactive
                CSS class binding — without re-creating the widget instances.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Loop Rebuild With Fresh Child State</h3>
              <p className="text-sm text-muted-foreground">
                Removing a widget filters the config array; adding one appends. Each
                new child widget mounts with a clean signal scope, initialized from
                constructor props. This exercises the compiler's keyed-reconciliation
                path inside <code className="mx-1 text-xs">.map()</code> bodies that
                emit distinct component types.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Derived Count Badges</h3>
              <p className="text-sm text-muted-foreground">
                Four independent memos (stat / progress / todo / chart count) each
                filter <code className="mx-1 text-xs">widgets()</code> by type and
                drive a badge. All four recompute on any widget list change, testing
                fan-out from a single upstream signal.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
