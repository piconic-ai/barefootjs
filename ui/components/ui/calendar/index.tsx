"use client"

import { createSignal, createMemo } from '@barefootjs/dom'

/**
 * Calendar Component
 *
 * A date picker calendar with month navigation.
 * Supports both controlled and uncontrolled modes.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * @example Uncontrolled (internal state)
 * ```tsx
 * <Calendar />
 * <Calendar defaultSelected={new Date(2025, 0, 15)} />
 * ```
 *
 * @example Controlled (external state)
 * ```tsx
 * <Calendar selected={date()} onSelect={setDate} />
 * ```
 *
 * @example With constraints
 * ```tsx
 * <Calendar fromDate={new Date()} toDate={addDays(new Date(), 30)} />
 * ```
 */

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
  isOutside: boolean
  isToday: boolean
  isDisabled: boolean
}

function generateCalendarDays(
  year: number,
  month: number,
  weekStartsOn: 0 | 1,
  disabled: boolean | ((date: Date) => boolean) | undefined,
  fromDate: Date | undefined,
  toDate: Date | undefined,
  showOutsideDays: boolean,
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
      week.push({
        date,
        isOutside: true,
        isToday: isToday(date),
        isDisabled: isDateDisabled(date, disabled, fromDate, toDate),
      })
    }
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    week.push({
      date,
      isOutside: false,
      isToday: isToday(date),
      isDisabled: isDateDisabled(date, disabled, fromDate, toDate),
    })
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
      week.push({
        date,
        isOutside: true,
        isToday: isToday(date),
        isDisabled: isDateDisabled(date, disabled, fromDate, toDate),
      })
      nextDay++
    }
    weeks.push(week)
  }

  // Hide outside days if not showing them
  if (!showOutsideDays) {
    return weeks
  }

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
const dayButtonBaseClasses = 'inline-flex items-center justify-center rounded-md text-sm size-8 font-normal transition-colors'
const dayButtonDefaultClasses = 'hover:bg-accent hover:text-accent-foreground'
const dayButtonSelectedClasses = 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
const dayButtonTodayClasses = 'bg-accent text-accent-foreground'
const dayButtonOutsideClasses = 'text-muted-foreground opacity-50'
const dayButtonDisabledClasses = 'text-muted-foreground opacity-50 pointer-events-none'

// --- Props ---

interface CalendarProps {
  mode?: 'single'
  selected?: Date
  defaultSelected?: Date
  onSelect?: (date: Date | undefined) => void
  defaultMonth?: Date
  showOutsideDays?: boolean
  disabled?: boolean | ((date: Date) => boolean)
  fromDate?: Date
  toDate?: Date
  weekStartsOn?: 0 | 1
  className?: string
}

// --- Component ---

function Calendar(props: CalendarProps) {
  const today = new Date()
  const initialMonth = props.defaultMonth ?? props.selected ?? props.defaultSelected ?? today

  // Month navigation state
  const [currentYear, setCurrentYear] = createSignal(initialMonth.getFullYear())
  const [currentMonth, setCurrentMonth] = createSignal(initialMonth.getMonth())

  // Selection state (controlled/uncontrolled dual-signal pattern)
  const [internalSelected, setInternalSelected] = createSignal<Date | undefined>(props.defaultSelected)
  const [controlledSelected, setControlledSelected] = createSignal<Date | undefined>(props.selected)

  const isControlled = createMemo(() => props.selected !== undefined)
  const selectedDate = createMemo(() => isControlled() ? controlledSelected() : internalSelected())

  // Calendar grid
  const weeks = createMemo(() =>
    generateCalendarDays(
      currentYear(),
      currentMonth(),
      props.weekStartsOn ?? 0,
      props.disabled,
      props.fromDate,
      props.toDate,
      props.showOutsideDays !== false,
    )
  )

  const monthLabel = createMemo(() =>
    formatMonthYear(new Date(currentYear(), currentMonth()))
  )

  const weekdays = createMemo(() =>
    (props.weekStartsOn ?? 0) === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN
  )

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
    const nextMonth = currentMonth() === 11 ? 0 : currentMonth() + 1
    const nextYear = currentMonth() === 11 ? currentYear() + 1 : currentYear()
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

  // Update calendar UI after day selection
  const updateCalendarUI = (container: HTMLElement, newDate: Date | undefined) => {
    // Clear previous selection
    const prevSelected = container.querySelector('[data-selected-single]')
    if (prevSelected) {
      prevSelected.removeAttribute('data-selected-single')
      prevSelected.removeAttribute('aria-selected')
      // Restore appropriate classes
      const isOutside = prevSelected.hasAttribute('data-outside')
      const isTodayEl = prevSelected.hasAttribute('data-today')
      const isDisabledEl = prevSelected.hasAttribute('data-disabled')
      let classes = dayButtonBaseClasses
      if (isDisabledEl) {
        classes += ` ${dayButtonDisabledClasses}`
      } else if (isOutside) {
        classes += ` ${dayButtonOutsideClasses}`
      } else if (isTodayEl) {
        classes += ` ${dayButtonTodayClasses}`
      } else {
        classes += ` ${dayButtonDefaultClasses}`
      }
      prevSelected.className = classes
    }

    // Apply new selection
    if (newDate) {
      const isoDate = toISODateString(newDate)
      const dayButton = container.querySelector(`[data-date="${isoDate}"]`) as HTMLElement | null
      if (dayButton) {
        dayButton.setAttribute('data-selected-single', '')
        dayButton.setAttribute('aria-selected', 'true')
        dayButton.className = `${dayButtonBaseClasses} ${dayButtonSelectedClasses}`
      }
    }
  }

  // Event delegation handler for day button clicks
  // Buttons inside .map() don't get direct event bindings from the compiler,
  // so we delegate from the root element.
  const handleCalendarClick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-slot="calendar-day-button"]') as HTMLElement | null
    if (!target) return
    if (target.hasAttribute('data-disabled')) return

    const dateStr = target.getAttribute('data-date')
    if (!dateStr) return

    const [y, m, d] = dateStr.split('-').map(Number)
    const clickedDate = new Date(y, m - 1, d)

    // Toggle: deselect if already selected
    const current = selectedDate()
    const newDate = (current && isSameDay(current, clickedDate)) ? undefined : clickedDate

    // Update state
    if (isControlled()) {
      setControlledSelected(newDate)
    } else {
      setInternalSelected(newDate)
    }

    // Update UI
    const container = target.closest('[data-slot="calendar"]') as HTMLElement
    if (container) {
      updateCalendarUI(container, newDate)
    }

    // Notify parent
    const scope = target.closest('[bf-s]')
    // @ts-ignore - onselect is set by parent during hydration
    const scopeCallback = scope?.onselect
    const handler = props.onSelect || scopeCallback
    handler?.(newDate)
  }

  // Day button classes helper
  const getDayClasses = (day: CalendarDay, isSelected: boolean): string => {
    if (day.isDisabled) {
      return `${dayButtonBaseClasses} ${dayButtonDisabledClasses}`
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

  return (
    <div data-slot="calendar" className={`${calendarClasses} ${props.className ?? ''}`} onClick={handleCalendarClick}>
      <div data-slot="calendar-month-caption" className={monthCaptionClasses}>
        <button
          data-slot="calendar-nav-prev"
          className={navButtonClasses}
          onClick={goToPrevMonth}
          disabled={isPrevDisabled()}
          aria-label="Go to previous month"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span data-slot="calendar-month-title" className={monthTitleClasses}>
          {monthLabel()}
        </span>
        <button
          data-slot="calendar-nav-next"
          className={navButtonClasses}
          onClick={goToNextMonth}
          disabled={isNextDisabled()}
          aria-label="Go to next month"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <table data-slot="calendar-month-grid" role="grid" className="w-full border-collapse">
        <thead>
          <tr>
            {weekdays().map((day) => (
              <th key={day} data-slot="calendar-weekday" className={weekdayClasses}>
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks().map((week) => (
            <tr key={toISODateString(week[0].date)} data-slot="calendar-week">
              {week.map((day) => {
                const isSelected = selectedDate() ? isSameDay(selectedDate()!, day.date) : false
                return (
                  <td key={toISODateString(day.date)} data-slot="calendar-day" className={dayCellClasses}>
                    <button
                      data-slot="calendar-day-button"
                      className={getDayClasses(day, isSelected)}
                      data-date={toISODateString(day.date)}
                      data-today={day.isToday || undefined}
                      data-outside={day.isOutside || undefined}
                      data-disabled={day.isDisabled || undefined}
                      data-selected-single={isSelected || undefined}
                      aria-selected={isSelected || undefined}
                      disabled={day.isDisabled}
                    >
                      {day.date.getDate()}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { Calendar }
export type { CalendarProps }
