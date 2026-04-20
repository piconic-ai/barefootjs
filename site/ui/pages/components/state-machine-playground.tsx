/**
 * State Machine Playground Reference Page (/components/state-machine-playground)
 *
 * Block-level composition pattern: interactive state machine explorer with
 * many-simultaneous-conditionals per list item, a reactive loop source, and
 * a multi-level history filter/group memo chain.
 */

import { StateMachinePlaygroundDemo } from '@/components/state-machine-playground-demo'
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

// Each state node evaluates three independent conditional classes
// (isCurrent / isReachable / isVisited). Firing a single transition
// flips all three across multiple list items at once — the compiler
// must wire reactive className bindings inside the states loop so
// every affected node updates on the next microtask.

function StateMachinePlayground() {
  const [machineId, setMachineId] = createSignal('traffic-light')
  const [currentState, setCurrentState] = createSignal(machine().initial)
  const [history, setHistory] = createSignal<HistoryEntry[]>([])
  const [onlyPossible, setOnlyPossible] = createSignal(false)
  const [historySearch, setHistorySearch] = createSignal('')
  const [groupBy, setGroupBy] = createSignal<'none' | 'event' | 'target'>('none')

  const machine = createMemo(() => MACHINES.find(m => m.id === machineId())!)

  // Drives the "reachable" highlight on state nodes.
  const possibleTransitions = createMemo(() =>
    machine().transitions.filter(t => t.from === currentState())
  )

  // The transitions loop source itself is reactive.
  const visibleTransitions = createMemo(() =>
    onlyPossible() ? possibleTransitions() : machine().transitions
  )

  // 3-level history memo chain: raw → filtered → grouped.
  const historyFiltered = createMemo(() => /* filter by search */)
  const historyGroups = createMemo(() => /* group by mode */)

  return (
    <div>
      {/* Every state node has three conditional classes that flip together. */}
      {machine().states.map(s => (
        <button key={s.id}
          className={\`state-node\${s.id === currentState() ? ' state-current' : ''}\${possibleTargetIds()[s.id] ? ' state-reachable' : ''}\${visitedSet()[s.id] ? ' state-visited' : ''}\`}
          onClick={() => setCurrentState(s.id)}
        >
          {s.label}
        </button>
      ))}

      {/* Loop source may be the full list OR the filtered one. */}
      {visibleTransitions().map(t => (
        <button key={t.id}
          disabled={t.from !== currentState()}
          onClick={() => fireTransition(t)}
        >
          {t.event}: {t.from} → {t.to}
        </button>
      ))}

      {/* Loop-of-loops over the grouped history. */}
      {historyGroups().map(g => (
        <div key={g.key}>
          <h4>{g.key}</h4>
          {g.entries.map(e => (
            <div key={String(e.id)}>{e.event}: {e.from} → {e.to}</div>
          ))}
        </div>
      ))}
    </div>
  )
}`

export function StateMachinePlaygroundRefPage() {
  return (
    <DocPage slug="state-machine-playground" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="State Machine Playground"
          description="Interactive state machine explorer with preset workflows, per-state multi-conditional classes that flip together on transition, a reactive transitions loop source, and a history memo chain that filters and groups derived views."
          {...getNavLinks('state-machine-playground')}
        />

        <Section id="preview" title="Preview">
          <Example title="" code={previewCode}>
            <StateMachinePlaygroundDemo />
          </Example>
        </Section>

        <Section id="features" title="Features">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Many Conditionals Switching Simultaneously</h3>
              <p className="text-sm text-muted-foreground">
                Every state node evaluates three independent conditional classes —
                <code className="mx-1 text-xs">isCurrent</code>,
                <code className="mx-1 text-xs">isReachableFromCurrent</code>, and
                <code className="mx-1 text-xs">isVisited</code> — inside the same
                <code className="mx-1 text-xs">.map()</code> body. Firing one transition
                flips all three conditions for multiple list items at once, exercising
                reactive className binding wiring across every loop item on a single
                signal update.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Dynamic Transition List</h3>
              <p className="text-sm text-muted-foreground">
                The <code className="mx-1 text-xs">&quot;Only possible&quot;</code> toggle switches the transitions
                loop source between the full machine transition array and the
                <code className="mx-1 text-xs">possibleTransitions()</code> filter. Toggling it
                shrinks or grows the rendered list entirely — the compiler must
                re-run the loop with a different source signal without stale list
                items left behind.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Machine Switching Reshapes Loop Structure</h3>
              <p className="text-sm text-muted-foreground">
                Selecting a different preset replaces the states, transitions, and
                initial state all at once via <code className="mx-1 text-xs">selectMachine()</code>.
                Every loop on the page (states, transitions, history) re-renders
                against completely new source data, stressing the compiler's
                key-based reconciliation.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">History Filter/Group Memo Chain</h3>
              <p className="text-sm text-muted-foreground">
                History rendering uses a three-level memo chain:
                <code className="mx-1 text-xs">history</code> →
                <code className="mx-1 text-xs">historyFiltered</code> (search text) →
                <code className="mx-1 text-xs">historyGroups</code> (mode: none / event / target).
                The outer grouped loop and each group's inner entries loop both react
                to signal changes upstream in the chain. Group keys change as the
                grouping mode changes, so every list item's key identity shifts.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
