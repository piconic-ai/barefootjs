"use client"
/**
 * CalendarSchedulerDemo
 *
 * 2D grid calendar with month/week view toggle and overlapping event layout.
 *
 * Compiler stress targets:
 * - View mode toggle changes loop structure entirely: month view renders a flat
 *   calendarDays loop; week view renders nested weekDays × HOURS 2D grid.
 * - Per-cell complex conditionals: each cell checks isCurrentMonth, isToday,
 *   and event count — multiple conditional branches inside a .map() body.
 * - Multi-level memo for overlap layout: weekEvents → weekEventsByDay →
 *   overlapGroups → eventPositions (4-level chain for week view).
 * - Outer-loop param capture in handlers: week-view hour-slot and event
 *   handlers are nested inside the weekDays() outer loop, inside the
 *   viewMode === 'week' conditional. This exercises the click dispatcher
 *   path that resolves both outer and inner loop keys via data-key / data-key-1.
 */

import { createSignal, createMemo } from '@barefootjs/client'

// --- Types ---

type ViewMode = 'month' | 'week'
type EventColor = 'blue' | 'green' | 'red' | 'purple' | 'orange'

type CalendarEvent = {
  id: number
  title: string
  date: string
  startHour: number
  duration: number
  color: EventColor
}

// --- Constants ---

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const HOUR_PX = 48

const COLOR_CLASSES: Record<EventColor, string> = {
  blue: 'bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900/30 dark:border-blue-500 dark:text-blue-300',
  green: 'bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-500 dark:text-emerald-300',
  red: 'bg-rose-100 border-rose-400 text-rose-800 dark:bg-rose-900/30 dark:border-rose-500 dark:text-rose-300',
  purple: 'bg-purple-100 border-purple-400 text-purple-800 dark:bg-purple-900/30 dark:border-purple-500 dark:text-purple-300',
  orange: 'bg-orange-100 border-orange-400 text-orange-800 dark:bg-orange-900/30 dark:border-orange-500 dark:text-orange-300',
}

const COLOR_OPTIONS: EventColor[] = ['blue', 'green', 'red', 'purple', 'orange']

// --- Pure helpers ---

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function getWeekStart(d: Date): Date {
  const r = new Date(d)
  r.setDate(d.getDate() - d.getDay())
  r.setHours(0, 0, 0, 0)
  return r
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6)
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

let _nextId = 100
function nextId(): number { return _nextId++ }

// --- Initial data ---

const TODAY = new Date()
const TODAY_KEY = toDateKey(TODAY)

function dayOffset(n: number): string { return toDateKey(addDays(TODAY, n)) }

const initialEvents: CalendarEvent[] = [
  { id: 1, title: 'Team Standup', date: TODAY_KEY, startHour: 9, duration: 1, color: 'blue' },
  { id: 2, title: 'Design Review', date: TODAY_KEY, startHour: 10, duration: 2, color: 'purple' },
  { id: 3, title: 'Lunch with Client', date: TODAY_KEY, startHour: 12, duration: 1, color: 'green' },
  { id: 4, title: 'Sprint Planning', date: dayOffset(1), startHour: 10, duration: 2, color: 'blue' },
  { id: 5, title: 'Architecture Review', date: dayOffset(1), startHour: 10, duration: 3, color: 'purple' },
  { id: 6, title: 'Release Prep', date: dayOffset(1), startHour: 14, duration: 1, color: 'orange' },
  { id: 7, title: 'All Hands', date: dayOffset(2), startHour: 11, duration: 1, color: 'red' },
  { id: 8, title: 'Code Review', date: dayOffset(3), startHour: 15, duration: 2, color: 'blue' },
  { id: 9, title: 'Product Demo', date: dayOffset(5), startHour: 13, duration: 1, color: 'green' },
  { id: 10, title: 'Weekly Report', date: dayOffset(-1), startHour: 16, duration: 1, color: 'orange' },
]

// --- Component ---

export function CalendarSchedulerDemo() {
  const [viewMode, setViewMode] = createSignal<ViewMode>('month')
  const [currentDate, setCurrentDate] = createSignal(new Date())
  const [events, setEvents] = createSignal<CalendarEvent[]>(initialEvents)
  const [selectedEventId, setSelectedEventId] = createSignal<number | null>(null)
  const [selectedDate, setSelectedDate] = createSignal<string | null>(null)
  const [newTitle, setNewTitle] = createSignal('')
  const [newColor, setNewColor] = createSignal<EventColor>('blue')
  const [creatingForHour, setCreatingForHour] = createSignal<number>(9)
  const [showCreateForm, setShowCreateForm] = createSignal(false)

  // --- Month view memos ---

  const monthLabel = createMemo(() => formatMonthYear(currentDate()))

  const calendarDays = createMemo(() => {
    const d = currentDate()
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const leadingDow = monthStart.getDay()
    const days: { date: Date; key: string; isCurrentMonth: boolean }[] = []

    for (let i = leadingDow - 1; i >= 0; i--) {
      const day = addDays(monthStart, -i - 1)
      days.push({ date: day, key: toDateKey(day), isCurrentMonth: false })
    }
    for (let n = 1; n <= monthEnd.getDate(); n++) {
      const day = new Date(d.getFullYear(), d.getMonth(), n)
      days.push({ date: day, key: toDateKey(day), isCurrentMonth: true })
    }
    const trailing = (7 - (days.length % 7)) % 7
    for (let i = 1; i <= trailing; i++) {
      const day = addDays(monthEnd, i)
      days.push({ date: day, key: toDateKey(day), isCurrentMonth: false })
    }
    return days
  })

  const eventsByDate = createMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const evt of events()) {
      if (!map[evt.date]) map[evt.date] = []
      map[evt.date].push(evt)
    }
    return map
  })

  // Combined memo: calendarDays + event counts.
  // Including count in the key forces mapArray to recreate the cell DOM when the
  // count changes (mapArray returns __existing for unchanged keys, so reactive
  // reads inside the cell body won't update without this).
  const calendarDaysWithCounts = createMemo(() => {
    const byDate = eventsByDate()
    return calendarDays().map(cell => ({
      ...cell,
      count: byDate[cell.key]?.length ?? 0,
    }))
  })

  // Day panel: flat loop of events for the selected date (avoids nested-loop click bug)
  const dayPanelEvents = createMemo(() => {
    const date = selectedDate()
    if (!date) return []
    return eventsByDate()[date] ?? []
  })

  // --- Week view memos (4-level overlap layout chain) ---

  const weekStart = createMemo(() => getWeekStart(currentDate()))
  const weekLabel = createMemo(() => formatWeekRange(weekStart()))

  const weekDays = createMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart(), i)
      return { date: d, key: toDateKey(d) }
    })
  )

  // Level 1: filter events for the displayed week
  const weekEvents = createMemo(() => {
    const keys = new Set(weekDays().map(d => d.key))
    return events().filter(e => keys.has(e.date))
  })

  // Level 2: group by day key
  const weekEventsByDay = createMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const evt of weekEvents()) {
      if (!map[evt.date]) map[evt.date] = []
      map[evt.date].push(evt)
    }
    return map
  })

  // Level 3: compute overlap groups within each day
  const overlapGroups = createMemo(() => {
    const result: Record<string, CalendarEvent[][]> = {}
    for (const [dayKey, dayEvts] of Object.entries(weekEventsByDay())) {
      const sorted = [...dayEvts].sort((a, b) => a.startHour - b.startHour)
      const groups: CalendarEvent[][] = []
      let group: CalendarEvent[] = []
      let maxEnd = -1

      for (const evt of sorted) {
        if (group.length > 0 && evt.startHour < maxEnd) {
          group.push(evt)
          maxEnd = Math.max(maxEnd, evt.startHour + evt.duration)
        } else {
          if (group.length > 0) groups.push(group)
          group = [evt]
          maxEnd = evt.startHour + evt.duration
        }
      }
      if (group.length > 0) groups.push(group)
      result[dayKey] = groups
    }
    return result
  })

  // Level 4: compute pixel position for each event
  const eventPositions = createMemo(() => {
    const positions: Record<number, { top: number; height: number; left: number; width: number }> = {}
    for (const [, groups] of Object.entries(overlapGroups())) {
      for (const group of groups) {
        const count = group.length
        group.forEach((evt, idx) => {
          positions[evt.id] = {
            top: evt.startHour * HOUR_PX,
            height: evt.duration * HOUR_PX - 2,
            left: (idx / count) * 100,
            width: (1 / count) * 100,
          }
        })
      }
    }
    return positions
  })

  // --- Derived ---

  const selectedEvent = createMemo(() => {
    const id = selectedEventId()
    if (id === null) return null
    return events().find(e => e.id === id) ?? null
  })

  const headerLabel = createMemo(() =>
    viewMode() === 'month' ? monthLabel() : weekLabel()
  )

  // --- Handlers ---

  function navigatePrev() {
    const d = currentDate()
    if (viewMode() === 'month') {
      setCurrentDate(new Date(d.getFullYear(), d.getMonth() - 1, 1))
    } else {
      setCurrentDate(addDays(d, -7))
    }
    setSelectedDate(null)
    setSelectedEventId(null)
  }

  function navigateNext() {
    const d = currentDate()
    if (viewMode() === 'month') {
      setCurrentDate(new Date(d.getFullYear(), d.getMonth() + 1, 1))
    } else {
      setCurrentDate(addDays(d, 7))
    }
    setSelectedDate(null)
    setSelectedEventId(null)
  }

  function selectDay(dateKey: string) {
    setSelectedDate(dateKey)
    setSelectedEventId(null)
    setShowCreateForm(false)
  }

  function openAddEvent() {
    setShowCreateForm(true)
    setCreatingForHour(9)
    setNewTitle('')
    setNewColor('blue')
    setSelectedEventId(null)
  }

  function selectEvent(id: number) {
    setSelectedEventId(id)
    setShowCreateForm(false)
  }

  // Week-view nested-loop click handlers. Each handler captures both the outer
  // loop param (d.key) and inner loop param (h / evt.id), exercising the
  // data-key / data-key-1 dispatcher path across the viewMode conditional branch.
  function openCreateInWeek(dateKey: string, hour: number) {
    setSelectedDate(dateKey)
    setSelectedEventId(null)
    setCreatingForHour(hour)
    setNewTitle('')
    setNewColor('blue')
    setShowCreateForm(true)
  }

  function selectWeekEvent(dateKey: string, id: number) {
    setSelectedDate(dateKey)
    setSelectedEventId(id)
    setShowCreateForm(false)
  }

  function confirmCreate() {
    const title = newTitle().trim()
    const date = selectedDate()
    if (!title || !date) return
    setEvents(prev => [...prev, {
      id: nextId(),
      title,
      date,
      startHour: creatingForHour(),
      duration: 1,
      color: newColor(),
    }])
    setShowCreateForm(false)
  }

  function cancelCreate() {
    setShowCreateForm(false)
  }

  function removeEvent(id: number) {
    setEvents(prev => prev.filter(e => e.id !== id))
    setSelectedEventId(null)
  }

  function closeDayPanel() {
    setSelectedDate(null)
    setSelectedEventId(null)
    setShowCreateForm(false)
  }

  return (
    <div className="calendar-scheduler-demo w-full space-y-4">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="today-btn h-8 px-3 text-sm border border-input rounded-md bg-background hover:bg-accent"
            onClick={() => { setCurrentDate(new Date()); setSelectedDate(null); setSelectedEventId(null) }}
          >
            Today
          </button>
          <button
            type="button"
            className="prev-btn h-8 w-8 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent text-base leading-none"
            onClick={navigatePrev}
          >
            ‹
          </button>
          <button
            type="button"
            className="next-btn h-8 w-8 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent text-base leading-none"
            onClick={navigateNext}
          >
            ›
          </button>
          <span className="calendar-header-label text-sm font-semibold">
            {headerLabel()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="event-count text-xs text-muted-foreground">
            {events().length} events
          </span>
          <div className="view-toggle flex overflow-hidden rounded-md border border-input">
            <button
              type="button"
              className={`month-view-btn h-8 px-3 text-sm ${viewMode() === 'month' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
              onClick={() => setViewMode('month')}
            >
              Month
            </button>
            <button
              type="button"
              className={`week-view-btn h-8 px-3 text-sm border-l border-input ${viewMode() === 'week' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
              onClick={() => setViewMode('week')}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      {/* Day Panel — flat loop of events for selected date (avoids nested-loop click handler bug) */}
      {selectedDate() ? (
        <div className="day-panel rounded-md border border-border bg-card p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="day-panel-date text-sm font-semibold">{selectedDate()}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="add-event-btn h-7 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent"
                onClick={openAddEvent}
              >
                + Add event
              </button>
              <button
                type="button"
                className="close-day-panel-btn h-7 w-7 flex items-center justify-center rounded border border-input text-xs"
                onClick={closeDayPanel}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Create form (within day panel) */}
          {showCreateForm() ? (
            <div className="event-create-form flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-2">
              <input
                className="new-event-title-input h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm min-w-32"
                placeholder="Event title…"
                value={newTitle()}
                onInput={(e) => setNewTitle((e.target as HTMLInputElement).value)}
              />
              <select
                className="new-event-color-select h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={newColor()}
                onChange={(e) => setNewColor((e.target as HTMLSelectElement).value as EventColor)}
              >
                {COLOR_OPTIONS.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
              <button
                type="button"
                className="create-confirm-btn h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground"
                onClick={confirmCreate}
              >
                Add
              </button>
              <button
                type="button"
                className="create-cancel-btn h-8 rounded-md border border-input bg-background px-3 text-sm"
                onClick={cancelCreate}
              >
                Cancel
              </button>
            </div>
          ) : null}

          {/* Flat list of events for selected date — single-level loop, no nesting */}
          {dayPanelEvents().length > 0 ? (
            <div className="day-event-list space-y-1">
              {dayPanelEvents().map(evt => (
                <button
                  key={String(evt.id)}
                  type="button"
                  className={`day-event-item w-full text-left rounded border-l-2 px-2 py-1 text-xs cursor-pointer hover:opacity-80 ${COLOR_CLASSES[evt.color]}`}
                  onClick={() => selectEvent(evt.id)}
                >
                  <span className="font-medium">{evt.title}</span>
                  <span className="ml-1 opacity-75">{formatHour(evt.startHour)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {dayPanelEvents().length === 0 && !showCreateForm() ? (
            <p className="day-empty-msg text-xs text-muted-foreground">No events. Click "+ Add event" to create one.</p>
          ) : null}

          {/* Selected event detail inside day panel */}
          {selectedEvent() ? (
            <div className="selected-event-detail rounded-md border p-2">
              <div className={`flex items-center justify-between rounded px-2 py-1 ${COLOR_CLASSES[selectedEvent()!.color]}`}>
                <div>
                  <span className="font-medium text-sm">{selectedEvent()!.title}</span>
                  <span className="ml-2 text-xs opacity-75">
                    {formatHour(selectedEvent()!.startHour)}–{formatHour(selectedEvent()!.startHour + selectedEvent()!.duration)}
                  </span>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    type="button"
                    className="delete-event-btn h-6 rounded px-2 text-xs border opacity-70 hover:opacity-100"
                    onClick={() => removeEvent(selectedEvent()!.id)}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="close-detail-btn h-6 w-6 flex items-center justify-center rounded border text-xs"
                    onClick={() => setSelectedEventId(null)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* MONTH VIEW */}
      {viewMode() === 'month' ? (
        <div className="month-view overflow-hidden rounded-md border border-border">
          <div className="grid grid-cols-7 border-b border-border">
            {DAYS_OF_WEEK.map(dow => (
              <div key={dow} className="py-2 text-center text-xs font-medium text-muted-foreground">
                {dow}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDaysWithCounts().map(cell => (
              <button
                key={`${cell.key}:${cell.count}`}
                type="button"
                className={`month-day-cell min-h-24 border-b border-r border-border p-1 text-left hover:bg-accent/40 ${cell.isCurrentMonth ? '' : 'opacity-40'}`}
                onClick={() => selectDay(cell.key)}
              >
                <div
                  className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${cell.key === TODAY_KEY ? 'today-marker bg-primary text-primary-foreground' : 'text-foreground'}`}
                >
                  {cell.date.getDate()}
                </div>
                {cell.count > 0 ? (
                  <div className="event-dot-count text-xs text-muted-foreground">
                    {cell.count} event{cell.count > 1 ? 's' : ''}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* WEEK VIEW */}
      {viewMode() === 'week' ? (
        <div className="week-view overflow-hidden rounded-md border border-border">
          {/* Day header row */}
          <div className="flex border-b border-border">
            <div className="w-14 flex-none" />
            {weekDays().map(d => (
              <div
                key={d.key}
                className={`flex-1 py-2 text-center text-xs font-medium ${d.key === TODAY_KEY ? 'text-primary' : 'text-muted-foreground'}`}
              >
                <div>{DAYS_OF_WEEK[d.date.getDay()]}</div>
                <div
                  className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${d.key === TODAY_KEY ? 'week-today-marker bg-primary text-primary-foreground' : ''}`}
                >
                  {d.date.getDate()}
                </div>
              </div>
            ))}
          </div>

          {/* Scrollable time grid */}
          <div className="week-time-grid overflow-y-auto" style="max-height: 480px">
            <div className="flex">
              {/* Hour label column */}
              <div className="week-hour-labels w-14 flex-none">
                {HOURS.map(h => (
                  <div
                    key={String(h)}
                    className="flex items-start justify-end border-b border-border pr-2 pt-0.5 text-xs text-muted-foreground"
                    style={`height: ${HOUR_PX}px`}
                  >
                    {h > 0 ? formatHour(h) : ''}
                  </div>
                ))}
              </div>

              {/* Day columns — nested loops with click handlers capturing outer (d.key)
                  and inner (h / evt.id) params across the viewMode conditional. */}
              {weekDays().map(d => (
                <div
                  key={d.key}
                  className="week-day-col relative flex-1 border-l border-border"
                  style={`height: ${24 * HOUR_PX}px`}
                >
                  {/* Hour rows: click to create event at that hour */}
                  {HOURS.map(h => (
                    <div
                      key={String(h)}
                      className="week-hour-slot absolute w-full border-b border-border cursor-pointer hover:bg-accent/30"
                      style={`top: ${h * HOUR_PX}px; height: ${HOUR_PX}px`}
                      onClick={() => openCreateInWeek(d.key, h)}
                    />
                  ))}

                  {/* Positioned events (click to select) */}
                  {(weekEventsByDay()[d.key] ?? []).map(evt => {
                    const pos = eventPositions()[evt.id]
                    if (!pos) return null
                    return (
                      <div
                        key={String(evt.id)}
                        className={`week-event absolute overflow-hidden rounded border px-1 py-0.5 text-xs cursor-pointer hover:opacity-80 ${COLOR_CLASSES[evt.color]}`}
                        style={`top: ${pos.top}px; height: ${pos.height}px; left: ${pos.left}%; width: ${pos.width}%; z-index: 1`}
                        onClick={() => selectWeekEvent(d.key, evt.id)}
                      >
                        <div className="font-medium truncate">{evt.title}</div>
                        <div className="opacity-75">{formatHour(evt.startHour)}</div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
