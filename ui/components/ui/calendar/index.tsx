"use client"

import { createSignal, createMemo } from '@barefootjs/client'
import { ChevronLeftIcon, ChevronRightIcon } from '../icon'

/**
 * Calendar Component
 *
 * A date picker calendar with month navigation.
 * Supports single date and date range selection modes.
 * Supports both controlled and uncontrolled modes.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * @example Single mode (controlled)
 * ```tsx
 * <Calendar selected={date()} onSelect={setDate} />
 * ```
 *
 * @example Range mode
 * ```tsx
 * <Calendar mode="range" selected={range()} onSelect={setRange} numberOfMonths={2} />
 * ```
 *
 * @example With constraints
 * ```tsx
 * <Calendar fromDate={new Date()} toDate={addDays(new Date(), 30)} />
 * ```
 */

// --- Types ---

/** Date range type for range selection mode */
export interface DateRange {
  from: Date
  to?: Date
}

// --- Calendar math helpers ---

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

function isInRange(date: Date, range: DateRange): boolean {
  if (!range.from || !range.to) return false
  const time = date.getTime()
  return time > range.from.getTime() && time < range.to.getTime()
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function toISODateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface CalendarDay {
  date: Date
  // Date-derived strings/numbers used by the template, pre-computed here so
  // the template reads member fields instead of calling JS date helpers
  // (`toISODateString(day.date)`, `day.date.getDate()`). A server-side
  // template language (Go html/template, Mojo, Xslate) has no JS runtime and
  // cannot call those helpers, so baking the results keeps the template a
  // pure member-access read that lowers cleanly to every adapter.
  isoDate: string
  dayNumber: number
  isOutside: boolean
  // True for an outside (prev/next-month) day when `showOutsideDays` is off —
  // the template renders an empty placeholder cell instead of a day button,
  // keeping the 7-column grid shape.
  isHidden: boolean
  isToday: boolean
  isDisabled: boolean
  // --- Selection state, pre-computed into the day data ---
  //
  // Selection (single + range) is baked onto each day at grid-build time
  // rather than computed by per-cell predicate calls in the template. A
  // server-side template language (Go html/template, Mojo, Xslate) has no
  // JS runtime and cannot call a user-defined predicate per cell, so a
  // `dayIsSingleSelected(day)`-style call in an attribute raised BF102 on
  // the Go adapter. Member access on pre-computed fields lowers cleanly to
  // every adapter; the values recompute reactively because `weeks0`/`weeks1`
  // depend on `selectedDate()`/`selectedRange()`, so a selection click
  // re-renders the keyed grid (no imperative DOM patching needed).
  isSingleSelected: boolean
  isRangeStart: boolean
  isRangeEnd: boolean
  isRangeMiddle: boolean
  ariaSelected: boolean
  buttonClasses: string
}

// Determine the range position for a given date within the selected range.
function computeRangePosition(
  date: Date,
  isOutside: boolean,
  range: DateRange | undefined,
): 'start' | 'end' | 'middle' | undefined {
  if (isOutside) return undefined
  if (!range?.from) return undefined
  if (isSameDay(date, range.from)) {
    return range.to ? 'start' : undefined
  }
  if (range.to && isSameDay(date, range.to)) return 'end'
  if (isInRange(date, range)) return 'middle'
  return undefined
}

// Build a fully-resolved CalendarDay with selection state baked in.
function buildDay(
  date: Date,
  isOutside: boolean,
  disabled: boolean | ((date: Date) => boolean) | undefined,
  fromDate: Date | undefined,
  toDate: Date | undefined,
  showOutsideDays: boolean,
  selectedDate: Date | undefined,
  selectedRange: DateRange | undefined,
  isRangeMode: boolean,
): CalendarDay {
  const isDisabled = isDateDisabled(date, disabled, fromDate, toDate)
  const rangePos = isRangeMode ? computeRangePosition(date, isOutside, selectedRange) : undefined
  const isSingleSelected = !isRangeMode && !!selectedDate && isSameDay(selectedDate, date)
  const isSelected = isSingleSelected ||
    !!(isRangeMode && !isOutside && selectedRange?.from && !selectedRange?.to && isSameDay(date, selectedRange.from))
  const day: CalendarDay = {
    date,
    isoDate: toISODateString(date),
    dayNumber: date.getDate(),
    isOutside,
    isHidden: isOutside && !showOutsideDays,
    isToday: isToday(date),
    isDisabled,
    isSingleSelected,
    isRangeStart: rangePos === 'start',
    isRangeEnd: rangePos === 'end',
    isRangeMiddle: rangePos === 'middle',
    ariaSelected: isSelected || rangePos !== undefined,
    buttonClasses: '',
  }
  day.buttonClasses = getDayClasses(day, isSelected, rangePos)
  return day
}

function generateCalendarDays(
  year: number,
  month: number,
  weekStartsOn: 0 | 1,
  disabled: boolean | ((date: Date) => boolean) | undefined,
  fromDate: Date | undefined,
  toDate: Date | undefined,
  showOutsideDays: boolean,
  selectedDate: Date | undefined,
  selectedRange: DateRange | undefined,
  isRangeMode: boolean,
): CalendarDay[][] {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = new Date(year, month, 1).getDay()
  // Offset: how many days from previous month to show
  const offset = (firstDay - weekStartsOn + 7) % 7

  const weeks: CalendarDay[][] = []
  let week: CalendarDay[] = []

  // Previous month days
  if (offset > 0) {
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    const prevDaysInMonth = getDaysInMonth(prevYear, prevMonth)
    for (let i = offset - 1; i >= 0; i--) {
      const date = new Date(prevYear, prevMonth, prevDaysInMonth - i)
      week.push(buildDay(date, true, disabled, fromDate, toDate, showOutsideDays, selectedDate, selectedRange, isRangeMode))
    }
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    week.push(buildDay(date, false, disabled, fromDate, toDate, showOutsideDays, selectedDate, selectedRange, isRangeMode))
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }

  // Next month days
  if (week.length > 0) {
    const nextMonth = month === 11 ? 0 : month + 1
    const nextYear = month === 11 ? year + 1 : year
    let nextDay = 1
    while (week.length < 7) {
      const date = new Date(nextYear, nextMonth, nextDay)
      week.push(buildDay(date, true, disabled, fromDate, toDate, showOutsideDays, selectedDate, selectedRange, isRangeMode))
      nextDay++
    }
    weeks.push(week)
  }

  // Outside (prev/next-month) days are kept in the grid for shape but flagged
  // `isHidden` when `showOutsideDays` is off; the template renders an empty
  // placeholder cell for them (see `buildDay`).
  return weeks
}

function isDateDisabled(
  date: Date,
  disabled: boolean | ((date: Date) => boolean) | undefined,
  fromDate: Date | undefined,
  toDate: Date | undefined,
): boolean {
  if (disabled === true) return true
  if (typeof disabled === 'function' && disabled(date)) return true
  if (fromDate) {
    const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())
    if (date < from) return true
  }
  if (toDate) {
    const to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate())
    if (date > to) return true
  }
  return false
}

// --- Weekday headers ---

const WEEKDAYS_SUN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const WEEKDAYS_MON = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// --- Styles ---

const calendarClasses = 'p-3'
const monthCaptionClasses = 'flex items-center justify-between mb-4'
const monthTitleClasses = 'text-sm font-medium'
const navButtonClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium size-7 bg-transparent hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'
const weekdayClasses = 'text-muted-foreground text-xs font-medium w-8 text-center'
const dayCellClasses = 'p-0 text-center'
const dayButtonBaseClasses = 'inline-flex items-center justify-center text-sm size-8 font-normal transition-colors'
const dayButtonDefaultClasses = 'rounded-md hover:bg-accent hover:text-accent-foreground'
const dayButtonSelectedClasses = 'rounded-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
const dayButtonTodayClasses = 'rounded-md bg-accent text-accent-foreground'
const dayButtonOutsideClasses = 'rounded-md text-muted-foreground opacity-50'
const dayButtonDisabledClasses = 'rounded-md text-muted-foreground opacity-50 pointer-events-none'
// Range-specific styles (shadcn/ui pattern)
const dayButtonRangeStartClasses = 'bg-primary text-primary-foreground rounded-l-md rounded-r-none'
const dayButtonRangeEndClasses = 'bg-primary text-primary-foreground rounded-r-md rounded-l-none'
const dayButtonRangeMiddleClasses = 'bg-accent text-accent-foreground rounded-none'

// --- Day button class helper ---

function getDayClasses(day: CalendarDay, isSelected: boolean, rangePosition: 'start' | 'end' | 'middle' | undefined): string {
  if (day.isDisabled) {
    return `${dayButtonBaseClasses} ${dayButtonDisabledClasses}`
  }
  if (rangePosition === 'start') {
    return `${dayButtonBaseClasses} ${dayButtonRangeStartClasses}`
  }
  if (rangePosition === 'end') {
    return `${dayButtonBaseClasses} ${dayButtonRangeEndClasses}`
  }
  if (rangePosition === 'middle') {
    return `${dayButtonBaseClasses} ${dayButtonRangeMiddleClasses}`
  }
  if (isSelected) {
    return `${dayButtonBaseClasses} ${dayButtonSelectedClasses}`
  }
  if (day.isOutside) {
    return `${dayButtonBaseClasses} ${dayButtonOutsideClasses}`
  }
  if (day.isToday) {
    return `${dayButtonBaseClasses} ${dayButtonTodayClasses}`
  }
  return `${dayButtonBaseClasses} ${dayButtonDefaultClasses}`
}

// --- Props ---

interface CalendarBaseProps {
  defaultMonth?: Date
  showOutsideDays?: boolean
  disabled?: boolean | ((date: Date) => boolean)
  fromDate?: Date
  toDate?: Date
  weekStartsOn?: 0 | 1
  numberOfMonths?: number
  className?: string
}

interface CalendarSingleProps extends CalendarBaseProps {
  mode?: 'single'
  selected?: Date
  defaultSelected?: Date
  onSelect?: (date: Date | undefined) => void
}

interface CalendarRangeProps extends CalendarBaseProps {
  mode: 'range'
  selected?: DateRange
  onSelect?: (range: DateRange | undefined) => void
}

type CalendarProps = CalendarSingleProps | CalendarRangeProps

// --- Component ---

function Calendar(props: CalendarProps) {
  const today = new Date()
  const isRangeMode = () => props.mode === 'range'
  // A memo (not a plain arrow) so the value materializes as template data on
  // server-side adapters — the layout conditionals below read it in the
  // template, where a no-JS backend can only reference data fields.
  const numMonths = createMemo(() => props.numberOfMonths ?? 1)

  const initialMonth = props.defaultMonth
    ?? (props.mode === 'range' ? (props as CalendarRangeProps).selected?.from : undefined)
    ?? (props.mode !== 'range' ? (props as CalendarSingleProps).selected : undefined)
    ?? (props.mode !== 'range' ? (props as CalendarSingleProps).defaultSelected : undefined)
    ?? today

  // Month navigation state
  const [currentYear, setCurrentYear] = createSignal(initialMonth.getFullYear())
  const [currentMonth, setCurrentMonth] = createSignal(initialMonth.getMonth())

  // Single mode selection state
  const [internalSelected, setInternalSelected] = createSignal<Date | undefined>(
    !isRangeMode() ? (props as CalendarSingleProps).defaultSelected : undefined
  )
  const selectedDate = createMemo(() => {
    if (isRangeMode()) return undefined
    const propSelected = (props as CalendarSingleProps).selected
    if (propSelected !== undefined) return propSelected
    return internalSelected()
  })

  // Range mode selection state
  const [internalRange, setInternalRange] = createSignal<DateRange | undefined>(
    isRangeMode() ? (props as CalendarRangeProps).selected : undefined
  )
  const selectedRange = createMemo(() => {
    if (!isRangeMode()) return undefined
    const propRange = (props as CalendarRangeProps).selected
    const internal = internalRange()
    return propRange ?? internal
  })

  const weekdays = createMemo(() =>
    (props.weekStartsOn ?? 0) === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN
  )

  // Grids depend on month AND selection: a selection click recomputes the
  // baked-in selection fields and the keyed grid reconciles in place.
  const weeks0 = createMemo(() => {
    return generateCalendarDays(
      currentYear(), currentMonth(),
      props.weekStartsOn ?? 0, props.disabled, props.fromDate, props.toDate, props.showOutsideDays !== false,
      selectedDate(), selectedRange(), isRangeMode(),
    )
  })
  const monthLabel0 = createMemo(() => formatMonthYear(new Date(currentYear(), currentMonth())))

  const weeks1 = createMemo(() => {
    const m = currentMonth() + 1
    const y = m > 11 ? currentYear() + 1 : currentYear()
    return generateCalendarDays(
      y, m > 11 ? 0 : m,
      props.weekStartsOn ?? 0, props.disabled, props.fromDate, props.toDate, props.showOutsideDays !== false,
      selectedDate(), selectedRange(), isRangeMode(),
    )
  })
  const monthLabel1 = createMemo(() => {
    const m = currentMonth() + 1
    const y = m > 11 ? currentYear() + 1 : currentYear()
    return formatMonthYear(new Date(y, m > 11 ? 0 : m))
  })

  // Check if prev/next month navigation should be disabled
  const isPrevDisabled = createMemo(() => {
    if (!props.fromDate) return false
    const prevMonth = currentMonth() === 0 ? 11 : currentMonth() - 1
    const prevYear = currentMonth() === 0 ? currentYear() - 1 : currentYear()
    const lastDayOfPrev = new Date(prevYear, prevMonth + 1, 0)
    const from = new Date(props.fromDate.getFullYear(), props.fromDate.getMonth(), props.fromDate.getDate())
    return lastDayOfPrev < from
  })

  const isNextDisabled = createMemo(() => {
    if (!props.toDate) return false
    const lastVisibleOffset = numMonths() - 1
    let nextMonth = currentMonth() + lastVisibleOffset
    let nextYear = currentYear()
    while (nextMonth > 11) { nextMonth -= 12; nextYear += 1 }
    if (nextMonth === 11) { nextMonth = 0; nextYear += 1 } else { nextMonth += 1 }
    const firstDayOfNext = new Date(nextYear, nextMonth, 1)
    const to = new Date(props.toDate.getFullYear(), props.toDate.getMonth(), props.toDate.getDate())
    return firstDayOfNext > to
  })

  // Navigation handlers
  const goToPrevMonth = () => {
    if (currentMonth() === 0) {
      setCurrentMonth(11)
      setCurrentYear(currentYear() - 1)
    } else {
      setCurrentMonth(currentMonth() - 1)
    }
  }

  const goToNextMonth = () => {
    if (currentMonth() === 11) {
      setCurrentMonth(0)
      setCurrentYear(currentYear() + 1)
    } else {
      setCurrentMonth(currentMonth() + 1)
    }
  }

  // Event delegation for day button clicks (day buttons are inside .map()).
  // Selection state lives in signals; the grid re-renders reactively, so the
  // handlers only update state and notify the parent — no imperative DOM.
  const handleCalendarClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement
    const target = el.closest('[data-slot="calendar-day-button"]') as HTMLElement | null
    if (!target) return
    if (target.hasAttribute('data-disabled')) return

    const dateStr = target.getAttribute('data-date')
    if (!dateStr) return

    const [y, m, d] = dateStr.split('-').map(Number)
    const clickedDate = new Date(y, m - 1, d)
    const container = target.closest('[data-slot="calendar"]') as HTMLElement

    if (isRangeMode()) {
      handleRangeClick(clickedDate, container)
    } else {
      handleSingleClick(clickedDate, container)
    }
  }

  const handleSingleClick = (clickedDate: Date, container: HTMLElement) => {
    const current = selectedDate()
    const newDate = (current && isSameDay(current, clickedDate)) ? undefined : clickedDate

    setInternalSelected(newDate)

    // Notify parent
    const scope = container?.closest('[bf-s]')
    // @ts-ignore - onselect is set by parent during hydration
    const scopeCallback = scope?.onselect
    const handler = (props as CalendarSingleProps).onSelect || scopeCallback
    handler?.(newDate)
  }

  const handleRangeClick = (clickedDate: Date, container: HTMLElement) => {
    const current = selectedRange()
    let newRange: DateRange | undefined

    if (!current?.from || (current.from && current.to)) {
      newRange = { from: clickedDate }
    } else {
      if (isSameDay(clickedDate, current.from)) {
        newRange = undefined
      } else if (clickedDate.getTime() < current.from.getTime()) {
        newRange = { from: clickedDate, to: current.from }
      } else {
        newRange = { from: current.from, to: clickedDate }
      }
    }

    setInternalRange(newRange)

    // Notify parent
    const scope = container?.closest('[bf-s]')
    // @ts-ignore - onselect is set by parent during hydration
    const scopeCallback = scope?.onselect
    const handler = (props as CalendarRangeProps).onSelect || scopeCallback
    handler?.(newRange)
  }

  function renderMonthGrid(weeks: CalendarDay[][], label: string, showPrev: boolean, showNext: boolean) {
    return (
      <div data-slot="calendar-month">
        <div data-slot="calendar-month-caption" className={monthCaptionClasses}>
          {showPrev ? (
            <button data-slot="calendar-nav-prev" className={navButtonClasses} disabled={isPrevDisabled()} aria-label="Go to previous month" onClick={goToPrevMonth}>
              <ChevronLeftIcon className="size-4" />
            </button>
          ) : (
            <div className="size-7" />
          )}
          <span data-slot="calendar-month-title" className={monthTitleClasses}>{label}</span>
          {showNext ? (
            <button data-slot="calendar-nav-next" className={navButtonClasses} disabled={isNextDisabled()} aria-label="Go to next month" onClick={goToNextMonth}>
              <ChevronRightIcon className="size-4" />
            </button>
          ) : (
            <div className="size-7" />
          )}
        </div>
        <table data-slot="calendar-month-grid" role="grid" className="w-full border-collapse">
          <thead>
            <tr>
              {weekdays().map((dayName: string) => (
                <th key={dayName} data-slot="calendar-weekday" className={weekdayClasses}>{dayName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week: CalendarDay[], wi: number) => (
              <tr key={wi} data-slot="calendar-week">
                {week.map((day: CalendarDay) => (
                  <td key={day.isoDate} data-slot="calendar-day" className={dayCellClasses}>
                    {day.isHidden ? (
                      <div className="size-8" />
                    ) : (
                      <button
                        data-slot="calendar-day-button"
                        className={day.buttonClasses}
                        data-date={day.isoDate}
                        data-today={day.isToday || undefined}
                        data-outside={day.isOutside || undefined}
                        data-disabled={day.isDisabled || undefined}
                        data-current-month={!day.isOutside || undefined}
                        data-selected-single={day.isSingleSelected || undefined}
                        data-selected-range-start={day.isRangeStart || undefined}
                        data-selected-range-end={day.isRangeEnd || undefined}
                        data-selected-range-middle={day.isRangeMiddle || undefined}
                        aria-selected={day.ariaSelected || undefined}
                        disabled={day.isDisabled}
                      >
                        {day.dayNumber}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div data-slot="calendar" className={`${calendarClasses} ${props.className ?? ''}`} onClick={handleCalendarClick}>
      <div className={numMonths() > 1 ? 'flex gap-4' : ''}>
        {renderMonthGrid(weeks0(), monthLabel0(), true, numMonths() === 1)}
        {numMonths() >= 2 && renderMonthGrid(weeks1(), monthLabel1(), false, true)}
      </div>
    </div>
  )
}

export { Calendar }
export type { CalendarProps, CalendarSingleProps, CalendarRangeProps }
