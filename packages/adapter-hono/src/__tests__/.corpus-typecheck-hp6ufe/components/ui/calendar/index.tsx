import { bfComment, bfText, bfTextEnd } from '@barefootjs/hono/utils'
import { createSignal, createMemo } from '@barefootjs/hono/client-shim'
import { ChevronLeftIcon, ChevronRightIcon } from '../icon'

export interface DateRange {
  from: Date
  to?: Date
}
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
function computeRangePosition(date: Date, isOutside: boolean, range: DateRange | undefined): 'start' | 'end' | 'middle' | undefined {
  if (isOutside) return undefined
  if (!range?.from) return undefined
  if (isSameDay(date, range.from)) {
    return range.to ? 'start' : undefined
  }
  if (range.to && isSameDay(date, range.to)) return 'end'
  if (isInRange(date, range)) return 'middle'
  return undefined
}
function isDateDisabled(date: Date, disabled: boolean | ((date: Date) => boolean) | undefined, fromDate: Date | undefined, toDate: Date | undefined): boolean {
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
const WEEKDAYS_SUN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const WEEKDAYS_MON = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
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
const dayButtonRangeStartClasses = 'bg-primary text-primary-foreground rounded-l-md rounded-r-none'
const dayButtonRangeEndClasses = 'bg-primary text-primary-foreground rounded-r-md rounded-l-none'
const dayButtonRangeMiddleClasses = 'bg-accent text-accent-foreground rounded-none'
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

export type { CalendarProps, CalendarSingleProps, CalendarRangeProps }

export function Calendar(__allProps: CalendarProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps: _bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Calendar_${Math.random().toString(36).slice(2, 8)}`
  const currentYear = () => initialMonth.getFullYear()
  const currentMonth = () => initialMonth.getMonth()
  const internalSelected = () => !isRangeMode() ? (props as CalendarSingleProps).defaultSelected : undefined
  const internalRange = () => isRangeMode() ? (props as CalendarRangeProps).selected : undefined
  const numMonths = () => props.numberOfMonths ?? 1
  const selectedDate = () => {
    if (isRangeMode()) return undefined
    const propSelected = (props as CalendarSingleProps).selected
    if (propSelected !== undefined) return propSelected
    return internalSelected()
  }
  const selectedRange = () => {
    if (!isRangeMode()) return undefined
    const propRange = (props as CalendarRangeProps).selected
    const internal = internalRange()
    return propRange ?? internal
  }
  const weekdays = () =>
    (props.weekStartsOn ?? 0) === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN
  const weeks0 = () => {
    return generateCalendarDays(
      currentYear(), currentMonth(),
      props.weekStartsOn ?? 0, props.disabled, props.fromDate, props.toDate, props.showOutsideDays !== false,
      selectedDate(), selectedRange(), isRangeMode(),
    )
  }
  const monthLabel0 = () => formatMonthYear(new Date(currentYear(), currentMonth()))
  const weeks1 = () => {
    const m = currentMonth() + 1
    const y = m > 11 ? currentYear() + 1 : currentYear()
    return generateCalendarDays(
      y, m > 11 ? 0 : m,
      props.weekStartsOn ?? 0, props.disabled, props.fromDate, props.toDate, props.showOutsideDays !== false,
      selectedDate(), selectedRange(), isRangeMode(),
    )
  }
  const monthLabel1 = () => {
    const m = currentMonth() + 1
    const y = m > 11 ? currentYear() + 1 : currentYear()
    return formatMonthYear(new Date(y, m > 11 ? 0 : m))
  }
  const isPrevDisabled = () => {
    if (!props.fromDate) return false
    const prevMonth = currentMonth() === 0 ? 11 : currentMonth() - 1
    const prevYear = currentMonth() === 0 ? currentYear() - 1 : currentYear()
    const lastDayOfPrev = new Date(prevYear, prevMonth + 1, 0)
    const from = new Date(props.fromDate.getFullYear(), props.fromDate.getMonth(), props.fromDate.getDate())
    return lastDayOfPrev < from
  }
  const isNextDisabled = () => {
    if (!props.toDate) return false
    const lastVisibleOffset = numMonths() - 1
    let nextMonth = currentMonth() + lastVisibleOffset
    let nextYear = currentYear()
    while (nextMonth > 11) { nextMonth -= 12; nextYear += 1 }
    if (nextMonth === 11) { nextMonth = 0; nextYear += 1 } else { nextMonth += 1 }
    const firstDayOfNext = new Date(nextYear, nextMonth, 1)
    const to = new Date(props.toDate.getFullYear(), props.toDate.getMonth(), props.toDate.getDate())
    return firstDayOfNext > to
  }
  const today = new Date()
  const isRangeMode = () => props.mode === 'range'
  const initialMonth = props.defaultMonth
    ?? (props.mode === 'range' ? (props as CalendarRangeProps).selected?.from : undefined)
    ?? (props.mode !== 'range' ? (props as CalendarSingleProps).selected : undefined)
    ?? (props.mode !== 'range' ? (props as CalendarSingleProps).defaultSelected : undefined)
    ?? today
  function buildDay(date: Date, isOutside: boolean, disabled: boolean | ((date: Date) => boolean) | undefined, fromDate: Date | undefined, toDate: Date | undefined, showOutsideDays: boolean, selectedDate: Date | undefined, selectedRange: DateRange | undefined, isRangeMode: boolean): CalendarDay {
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
  function generateCalendarDays(year: number, month: number, weekStartsOn: 0 | 1, disabled: boolean | ((date: Date) => boolean) | undefined, fromDate: Date | undefined, toDate: Date | undefined, showOutsideDays: boolean, selectedDate: Date | undefined, selectedRange: DateRange | undefined, isRangeMode: boolean): CalendarDay[][] {
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

  return (
    <div data-slot="calendar" className={`${calendarClasses} ${props.className ?? ''}`} onClick={() => {}} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s30"><div className={`${numMonths() > 1 ? 'flex gap-4' : ''}`} bf="s29"><div data-slot="calendar-month"><div data-slot="calendar-month-caption" className={`flex items-center justify-between mb-4`} bf="s7">{true ? <button data-slot="calendar-nav-prev" className={`inline-flex items-center justify-center rounded-md text-sm font-medium size-7 bg-transparent hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50`} disabled={(isPrevDisabled()) || undefined} aria-label="Go to previous month" onClick={() => {}} bf="s1"><ChevronLeftIcon className="size-4" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /></button> : <div className="size-7" />}<span data-slot="calendar-month-title" className={`text-sm font-medium`} bf="s3">{bfText("s2")}{monthLabel0()}{bfTextEnd()}</span>{numMonths() === 1 ? <button bf-c="s4" data-slot="calendar-nav-next" className={`inline-flex items-center justify-center rounded-md text-sm font-medium size-7 bg-transparent hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50`} disabled={(isNextDisabled()) || undefined} aria-label="Go to next month" onClick={() => {}} bf="s6"><ChevronRightIcon className="size-4" __instanceId={`${__scopeId}_s5`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s5'} /></button> : <div bf-c="s4" className="size-7" />}</div><table data-slot="calendar-month-grid" role="grid" className="w-full border-collapse"><thead><tr bf="s9">{bfComment('loop:l0')}{weekdays().map((dayName: string) => <th key={dayName} data-slot="calendar-weekday" className={`text-muted-foreground text-xs font-medium w-8 text-center`} data-key={String(dayName)}>{bfText("s8")}{dayName}{bfTextEnd()}</th>)}{bfComment('/loop:l0')}</tr></thead><tbody bf="s14">{bfComment('loop:l2')}{weeks0().map((week: CalendarDay[], wi: number) => <tr key={wi} data-slot="calendar-week" data-key={String(wi)} bf="s13">{bfComment('loop:l1')}{week.map((day: CalendarDay) => <td key={day.isoDate} data-slot="calendar-day" className={`p-0 text-center`} data-key-1={String(day.isoDate)}>{day.isHidden ? <div bf-c="s10" className="size-8" /> : <button bf-c="s10" data-slot="calendar-day-button" className={day.buttonClasses} data-date={day.isoDate} data-today={(day.isToday) || undefined} data-outside={(day.isOutside) || undefined} data-disabled={(day.isDisabled) || undefined} data-current-month={(!day.isOutside) || undefined} data-selected-single={(day.isSingleSelected) || undefined} data-selected-range-start={(day.isRangeStart) || undefined} data-selected-range-end={(day.isRangeEnd) || undefined} data-selected-range-middle={(day.isRangeMiddle) || undefined} aria-selected={(day.ariaSelected) || undefined} disabled={(day.isDisabled) || undefined} bf="s12">{bfText("s11")}{day.dayNumber}{bfTextEnd()}</button>}</td>)}{bfComment('/loop:l1')}</tr>)}{bfComment('/loop:l2')}</tbody></table></div>{numMonths() >= 2 ? <div bf-c="s15" data-slot="calendar-month"><div data-slot="calendar-month-caption" className={`flex items-center justify-between mb-4`}>{false ? <button data-slot="calendar-nav-prev" className={`inline-flex items-center justify-center rounded-md text-sm font-medium size-7 bg-transparent hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50`} disabled={(isPrevDisabled()) || undefined} aria-label="Go to previous month" onClick={() => {}} bf="s17"><ChevronLeftIcon className="size-4" __instanceId={`${__scopeId}_s16`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s16'} /></button> : <div className="size-7" />}<span data-slot="calendar-month-title" className={`text-sm font-medium`} bf="s19">{bfText("s18")}{monthLabel1()}{bfTextEnd()}</span>{true ? <button data-slot="calendar-nav-next" className={`inline-flex items-center justify-center rounded-md text-sm font-medium size-7 bg-transparent hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50`} disabled={(isNextDisabled()) || undefined} aria-label="Go to next month" onClick={() => {}} bf="s21"><ChevronRightIcon className="size-4" __instanceId={`${__scopeId}_s20`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s20'} /></button> : <div className="size-7" />}</div><table data-slot="calendar-month-grid" role="grid" className="w-full border-collapse"><thead><tr bf="s23">{bfComment('loop:l3')}{weekdays().map((dayName: string) => <th key={dayName} data-slot="calendar-weekday" className={`text-muted-foreground text-xs font-medium w-8 text-center`} data-key={String(dayName)}>{bfText("s22")}{dayName}{bfTextEnd()}</th>)}{bfComment('/loop:l3')}</tr></thead><tbody bf="s28">{bfComment('loop:l5')}{weeks1().map((week: CalendarDay[], wi: number) => <tr key={wi} data-slot="calendar-week" data-key={String(wi)} bf="s27">{bfComment('loop:l4')}{week.map((day: CalendarDay) => <td key={day.isoDate} data-slot="calendar-day" className={`p-0 text-center`} data-key-1={String(day.isoDate)}>{day.isHidden ? <div bf-c="s24" className="size-8" /> : <button bf-c="s24" data-slot="calendar-day-button" className={day.buttonClasses} data-date={day.isoDate} data-today={(day.isToday) || undefined} data-outside={(day.isOutside) || undefined} data-disabled={(day.isDisabled) || undefined} data-current-month={(!day.isOutside) || undefined} data-selected-single={(day.isSingleSelected) || undefined} data-selected-range-start={(day.isRangeStart) || undefined} data-selected-range-end={(day.isRangeEnd) || undefined} data-selected-range-middle={(day.isRangeMiddle) || undefined} aria-selected={(day.ariaSelected) || undefined} disabled={(day.isDisabled) || undefined} bf="s26">{bfText("s25")}{day.dayNumber}{bfTextEnd()}</button>}</td>)}{bfComment('/loop:l4')}</tr>)}{bfComment('/loop:l5')}</tbody></table></div> : <>{bfComment("cond-start:s15")}{bfComment("cond-end:s15")}</>}</div></div>
  )
}