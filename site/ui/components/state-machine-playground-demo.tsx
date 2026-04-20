"use client"
/**
 * StateMachinePlaygroundDemo
 *
 * Interactive state machine explorer with preset machines, live transitions,
 * and a filtered/grouped history log.
 *
 * Compiler stress targets:
 * - Many conditionals switching simultaneously on state change: every state
 *   node in the states loop evaluates three independent conditional classes
 *   (isCurrent / isReachableFromCurrent / isVisited). Firing one transition
 *   flips all three conditionals for multiple list items at once.
 * - Dynamic transition list: the transitions loop is either the full
 *   transitions array or the filtered possibleTransitions() array depending
 *   on a toggle — the loop source itself is reactive.
 * - Per-item reactive disabled attribute: each transition button's `disabled`
 *   is wired to `t.from === currentState()`, exercising attribute binding
 *   inside a list whose source may itself change.
 * - Machine switching reshapes loop structure entirely: picking a different
 *   preset swaps the states, transitions, and initial state at once, so
 *   every loop's length and content changes simultaneously.
 * - Derived views: history() → historyFiltered() (by search) →
 *   historyGroups() (by event/target) forms a 3-level memo chain that
 *   feeds a top-level loop-of-loops. The outer group loop is reactive
 *   (keys change as grouping mode changes); each group's inner entries
 *   loop is also reactive. (Exercises the compiler path fixed by
 *   "wire nested mapArray for inner .map() inside conditional-branch
 *   loops" — an inner `.map()` directly inside an outer `.map()` that
 *   lives inside a reactive conditional branch must also be emitted as
 *   a nested mapArray, or entries appended to an existing group will
 *   not appear on the client.)
 */

import { createSignal, createMemo } from '@barefootjs/client'

// --- Types ---

type StateKind = 'initial' | 'final' | 'error' | 'normal'

type StateNode = {
  id: string
  label: string
  kind: StateKind
  description: string
}

type Transition = {
  id: string
  from: string
  to: string
  event: string
}

type Machine = {
  id: string
  name: string
  description: string
  initial: string
  states: StateNode[]
  transitions: Transition[]
}

type HistoryEntry = {
  id: number
  ts: number
  from: string
  to: string
  event: string
  machineId: string
}

type GroupBy = 'none' | 'event' | 'target'

type HistoryGroup = {
  key: string
  entries: HistoryEntry[]
}

// --- Preset machines ---

const TRAFFIC_LIGHT: Machine = {
  id: 'traffic-light',
  name: 'Traffic Light',
  description: 'A classic three-state loop with a maintenance detour.',
  initial: 'red',
  states: [
    { id: 'red', label: 'Red', kind: 'initial', description: 'Stop. No cross traffic.' },
    { id: 'green', label: 'Green', kind: 'normal', description: 'Go. Intersection open.' },
    { id: 'yellow', label: 'Yellow', kind: 'normal', description: 'Slow. Prepare to stop.' },
    { id: 'flashing', label: 'Flashing', kind: 'error', description: 'Maintenance mode.' },
  ],
  transitions: [
    { id: 'tl-go', from: 'red', to: 'green', event: 'GO' },
    { id: 'tl-slow', from: 'green', to: 'yellow', event: 'SLOW' },
    { id: 'tl-stop', from: 'yellow', to: 'red', event: 'STOP' },
    { id: 'tl-fail-r', from: 'red', to: 'flashing', event: 'FAIL' },
    { id: 'tl-fail-g', from: 'green', to: 'flashing', event: 'FAIL' },
    { id: 'tl-fail-y', from: 'yellow', to: 'flashing', event: 'FAIL' },
    { id: 'tl-repair', from: 'flashing', to: 'red', event: 'REPAIR' },
  ],
}

const ORDER_WORKFLOW: Machine = {
  id: 'order-workflow',
  name: 'Order Workflow',
  description: 'E-commerce order lifecycle with cancel and refund branches.',
  initial: 'pending',
  states: [
    { id: 'pending', label: 'Pending', kind: 'initial', description: 'Order submitted, awaiting payment.' },
    { id: 'processing', label: 'Processing', kind: 'normal', description: 'Payment captured, preparing shipment.' },
    { id: 'shipped', label: 'Shipped', kind: 'normal', description: 'In transit to customer.' },
    { id: 'delivered', label: 'Delivered', kind: 'final', description: 'Received by customer.' },
    { id: 'cancelled', label: 'Cancelled', kind: 'final', description: 'Order cancelled.' },
    { id: 'refunded', label: 'Refunded', kind: 'final', description: 'Payment returned.' },
  ],
  transitions: [
    { id: 'ow-pay', from: 'pending', to: 'processing', event: 'PAY' },
    { id: 'ow-ship', from: 'processing', to: 'shipped', event: 'SHIP' },
    { id: 'ow-deliver', from: 'shipped', to: 'delivered', event: 'DELIVER' },
    { id: 'ow-cancel-p', from: 'pending', to: 'cancelled', event: 'CANCEL' },
    { id: 'ow-cancel-pr', from: 'processing', to: 'cancelled', event: 'CANCEL' },
    { id: 'ow-refund-c', from: 'cancelled', to: 'refunded', event: 'REFUND' },
    { id: 'ow-refund-d', from: 'delivered', to: 'refunded', event: 'REFUND' },
  ],
}

const DOCUMENT_REVIEW: Machine = {
  id: 'document-review',
  name: 'Document Review',
  description: 'Editorial workflow with revision loop.',
  initial: 'draft',
  states: [
    { id: 'draft', label: 'Draft', kind: 'initial', description: 'Author is writing.' },
    { id: 'review', label: 'In Review', kind: 'normal', description: 'Awaiting editor feedback.' },
    { id: 'revision', label: 'Revision', kind: 'normal', description: 'Author making edits.' },
    { id: 'approved', label: 'Approved', kind: 'normal', description: 'Ready to publish.' },
    { id: 'published', label: 'Published', kind: 'final', description: 'Live.' },
    { id: 'archived', label: 'Archived', kind: 'final', description: 'Pulled offline.' },
  ],
  transitions: [
    { id: 'dr-submit', from: 'draft', to: 'review', event: 'SUBMIT' },
    { id: 'dr-request', from: 'review', to: 'revision', event: 'REQUEST_CHANGES' },
    { id: 'dr-resubmit', from: 'revision', to: 'review', event: 'RESUBMIT' },
    { id: 'dr-approve', from: 'review', to: 'approved', event: 'APPROVE' },
    { id: 'dr-publish', from: 'approved', to: 'published', event: 'PUBLISH' },
    { id: 'dr-archive', from: 'published', to: 'archived', event: 'ARCHIVE' },
    { id: 'dr-retract', from: 'approved', to: 'revision', event: 'RETRACT' },
  ],
}

const MACHINES: Machine[] = [TRAFFIC_LIGHT, ORDER_WORKFLOW, DOCUMENT_REVIEW]

const KIND_BADGE: Record<StateKind, string> = {
  initial: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  final: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  error: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  normal: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const KIND_LABEL: Record<StateKind, string> = {
  initial: 'initial',
  final: 'final',
  error: 'error',
  normal: 'state',
}

let _nextHistoryId = 1
function nextHistoryId(): number { return _nextHistoryId++ }

function getMachine(id: string): Machine {
  return MACHINES.find(m => m.id === id) ?? MACHINES[0]
}

function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function StateMachinePlaygroundDemo() {
  const [machineId, setMachineId] = createSignal<string>(TRAFFIC_LIGHT.id)
  const [currentState, setCurrentState] = createSignal<string>(TRAFFIC_LIGHT.initial)
  const [history, setHistory] = createSignal<HistoryEntry[]>([])
  const [visitedIds, setVisitedIds] = createSignal<string[]>([TRAFFIC_LIGHT.initial])
  const [historySearch, setHistorySearch] = createSignal('')
  const [groupBy, setGroupBy] = createSignal<GroupBy>('none')
  const [onlyPossible, setOnlyPossible] = createSignal(false)

  const machine = createMemo(() => getMachine(machineId()))

  const currentStateDef = createMemo(() => {
    const m = machine()
    return m.states.find(s => s.id === currentState()) ?? m.states[0]
  })

  // Transitions outgoing from the current state — drives "possible" highlight and filter mode.
  const possibleTransitions = createMemo(() =>
    machine().transitions.filter(t => t.from === currentState())
  )

  const possibleTargetIds = createMemo(() => {
    const set: Record<string, true> = {}
    for (const t of possibleTransitions()) set[t.to] = true
    return set
  })

  const visitedSet = createMemo(() => {
    const set: Record<string, true> = {}
    for (const id of visitedIds()) set[id] = true
    return set
  })

  // Visible transitions: either all or only those from the current state.
  // Changing `onlyPossible` swaps the loop source entirely.
  const visibleTransitions = createMemo(() =>
    onlyPossible() ? possibleTransitions() : machine().transitions
  )

  // History filter chain: raw → filtered → grouped.
  const historyFiltered = createMemo(() => {
    const q = historySearch().trim().toLowerCase()
    const all = history()
    if (!q) return all
    return all.filter(h =>
      h.event.toLowerCase().includes(q) ||
      h.from.toLowerCase().includes(q) ||
      h.to.toLowerCase().includes(q)
    )
  })

  const historyGroups = createMemo<HistoryGroup[]>(() => {
    const mode = groupBy()
    const entries = historyFiltered()
    if (mode === 'none') {
      return [{ key: 'All transitions', entries }]
    }
    const map: Record<string, HistoryEntry[]> = {}
    const order: string[] = []
    for (const e of entries) {
      const key = mode === 'event' ? e.event : e.to
      if (!map[key]) {
        map[key] = []
        order.push(key)
      }
      map[key].push(e)
    }
    return order.map(key => ({ key, entries: map[key] }))
  })

  const historyCount = createMemo(() => history().length)
  const visitedCount = createMemo(() => visitedIds().length)
  const totalStates = createMemo(() => machine().states.length)
  const possibleCount = createMemo(() => possibleTransitions().length)

  function fireTransition(transition: Transition) {
    if (transition.from !== currentState()) return
    const entry: HistoryEntry = {
      id: nextHistoryId(),
      ts: Date.now(),
      from: transition.from,
      to: transition.to,
      event: transition.event,
      machineId: machineId(),
    }
    setCurrentState(transition.to)
    setHistory(prev => [...prev, entry])
    setVisitedIds(prev => prev.includes(transition.to) ? prev : [...prev, transition.to])
  }

  function selectMachine(id: string) {
    const m = getMachine(id)
    setMachineId(id)
    setCurrentState(m.initial)
    setHistory([])
    setVisitedIds([m.initial])
    setHistorySearch('')
  }

  function reset() {
    const m = machine()
    setCurrentState(m.initial)
    setHistory([])
    setVisitedIds([m.initial])
    setHistorySearch('')
  }

  return (
    <div className="state-machine-playground-demo w-full space-y-4">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" for="sm-machine-select">
            Machine
          </label>
          <select
            id="sm-machine-select"
            className="machine-select h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={machineId()}
            onChange={(e) => selectMachine((e.target as HTMLSelectElement).value)}
          >
            {MACHINES.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <span className="machine-description text-xs text-muted-foreground">
            {machine().description}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="current-state-label text-sm">
            Current: <span className="font-semibold">{currentStateDef().label}</span>
          </span>
          <button
            type="button"
            className="reset-btn h-8 px-3 text-sm rounded-md border border-input bg-background hover:bg-accent"
            onClick={reset}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="stats-strip grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Current</div>
          <div className="current-state-name text-sm font-semibold">{currentStateDef().label}</div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Visited</div>
          <div className="visited-count text-sm font-semibold">{visitedCount()} / {totalStates()}</div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Possible now</div>
          <div className="possible-count text-sm font-semibold">{possibleCount()}</div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Events fired</div>
          <div className="history-count text-sm font-semibold">{historyCount()}</div>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="grid gap-3 lg:grid-cols-3">

        {/* States column — each state evaluates 3 simultaneous conditional classes */}
        <div className="states-column rounded-md border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">States</h3>
            <span className="text-xs text-muted-foreground">{totalStates()} total</span>
          </div>
          <div className="states-list space-y-1.5">
            {machine().states.map((s: StateNode) => (
              <button
                key={s.id}
                type="button"
                data-state-id={s.id}
                className={`state-node w-full rounded-md border px-3 py-2 text-left transition-colors${s.id === currentState() ? ' state-current border-primary bg-primary/10' : ''}${possibleTargetIds()[s.id] ? ' state-reachable ring-1 ring-primary/40' : ''}${visitedSet()[s.id] && s.id !== currentState() ? ' state-visited bg-accent/40' : ''}${!visitedSet()[s.id] && s.id !== currentState() ? ' border-border' : ''}`}
                onClick={() => setCurrentState(s.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="state-node-label text-sm font-medium">{s.label}</span>
                  <span className={`state-node-kind rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${KIND_BADGE[s.kind]}`}>
                    {KIND_LABEL[s.kind]}
                  </span>
                </div>
                <p className="state-node-desc mt-0.5 text-xs text-muted-foreground">
                  {s.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Transitions column — loop source itself is reactive */}
        <div className="transitions-column rounded-md border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Transitions</h3>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="only-possible-toggle h-3 w-3"
                checked={onlyPossible()}
                onChange={(e) => setOnlyPossible((e.target as HTMLInputElement).checked)}
              />
              Only possible
            </label>
          </div>
          {visibleTransitions().length > 0 ? (
            <div className="transitions-list space-y-1">
              {visibleTransitions().map((t: Transition) => (
                <button
                  key={t.id}
                  type="button"
                  data-transition-id={t.id}
                  className={`transition-item flex w-full items-center justify-between rounded border px-2.5 py-1.5 text-xs transition-opacity${t.from === currentState() ? ' transition-enabled border-primary/40 bg-primary/5 hover:bg-primary/10' : ' transition-disabled opacity-50 border-border'}`}
                  disabled={t.from !== currentState()}
                  onClick={() => fireTransition(t)}
                >
                  <span className="transition-event font-mono font-semibold">{t.event}</span>
                  <span className="transition-arrow text-muted-foreground">
                    {t.from} → {t.to}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="transitions-empty-msg text-xs text-muted-foreground">
              No transitions {onlyPossible() ? 'available from current state' : 'defined'}.
            </p>
          )}
        </div>

        {/* History column — 3-level memo chain feeds a loop-of-loops */}
        <div className="history-column rounded-md border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">History</h3>
            <span className="text-xs text-muted-foreground">{historyCount()} events</span>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              type="text"
              className="history-search h-8 flex-1 min-w-24 rounded-md border border-input bg-background px-2 text-xs"
              placeholder="Filter…"
              value={historySearch()}
              onInput={(e) => setHistorySearch((e.target as HTMLInputElement).value)}
            />
            <select
              className="history-group-select h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={groupBy()}
              onChange={(e) => setGroupBy((e.target as HTMLSelectElement).value as GroupBy)}
            >
              <option value="none">No group</option>
              <option value="event">By event</option>
              <option value="target">By target</option>
            </select>
          </div>
          {historyCount() === 0 ? (
            <p className="history-empty-msg text-xs text-muted-foreground">
              No transitions yet. Click a transition to fire it.
            </p>
          ) : (
            <div className="history-groups space-y-2">
              {historyGroups().map((g: HistoryGroup) => (
                <div key={g.key} className="history-group">
                  {groupBy() !== 'none' ? (
                    <div className="history-group-header mb-1 flex items-center justify-between">
                      <span className="history-group-key text-xs font-semibold">{g.key}</span>
                      <span className="text-[10px] text-muted-foreground">{g.entries.length}</span>
                    </div>
                  ) : null}
                  <ul className="history-entries space-y-0.5">
                    {g.entries.map((e: HistoryEntry) => (
                      <li
                        key={String(e.id)}
                        className="history-entry flex items-center justify-between rounded border border-border/60 px-2 py-1 text-[11px]"
                      >
                        <span className="history-entry-event font-mono font-semibold">{e.event}</span>
                        <span className="history-entry-path text-muted-foreground">
                          {e.from} → {e.to}
                        </span>
                        <span className="history-entry-ts text-[10px] text-muted-foreground">
                          {formatTs(e.ts)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
