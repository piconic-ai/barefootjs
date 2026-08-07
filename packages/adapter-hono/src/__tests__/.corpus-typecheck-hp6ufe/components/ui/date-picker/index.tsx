import { bfText, bfTextEnd } from '@barefootjs/hono/utils'
import { createSignal, createMemo } from '@barefootjs/hono/client-shim'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import { CalendarIcon } from '../icon'
import { Button } from '../button'
import { Popover, PopoverTrigger, PopoverContent } from '../popover'
import { Calendar, DateRange } from '../calendar'

const defaultFormatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

interface DatePickerProps extends HTMLBaseAttributes {
  /** Currently selected date */
  selected?: Date
  /** Callback when date selection changes */
  onSelect?: (date: Date | undefined) => void
  /** Custom date formatter. Default: Intl.DateTimeFormat */
  formatDate?: (date: Date) => string
  /** Placeholder text when no date is selected */
  placeholder?: string
  /** Whether the picker is disabled */
  disabled?: boolean
  /** Function to disable specific dates */
  disabledDates?: (date: Date) => boolean
  /** Alignment of the popover relative to trigger */
  align?: 'start' | 'center' | 'end'
  /** Additional classes for the trigger button */
  triggerClassName?: string
}

const triggerBaseClasses = 'w-[240px] justify-start text-left font-normal'

const triggerPlaceholderClasses = 'text-muted-foreground'

interface DateRangePickerProps extends HTMLBaseAttributes {
  /** Currently selected date range */
  selected?: DateRange
  /** Callback when range selection changes */
  onSelect?: (range: DateRange | undefined) => void
  /** Custom date formatter. Default: Intl.DateTimeFormat */
  formatDate?: (date: Date) => string
  /** Placeholder text when no range is selected */
  placeholder?: string
  /** Whether the picker is disabled */
  disabled?: boolean
  /** Function to disable specific dates */
  disabledDates?: (date: Date) => boolean
  /** Alignment of the popover relative to trigger */
  align?: 'start' | 'center' | 'end'
  /** Number of months to display */
  numberOfMonths?: number
  /** Additional classes for the trigger button */
  triggerClassName?: string
}

export type { DatePickerProps, DateRangePickerProps }
export type { DateRange } from '../calendar'

export function DatePicker(__allProps: DatePickerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DatePicker_${Math.random().toString(36).slice(2, 8)}`
  const open = () => false
  const setOpen = (..._args: any[]) => {}
  const internalSelected = () => undefined as Date | undefined
  const setInternalSelected = (..._args: any[]) => {}
  const currentSelected = () =>
    props.selected !== undefined ? props.selected : internalSelected()
  const displayText = () => {
    const date = currentSelected()
    if (date) {
      const fmt = props.formatDate ?? defaultFormatDate
      return fmt(date)
    }
    return props.placeholder ?? 'Pick a date'
  }
  const handleSelect = (date: Date | undefined) => {
    if (props.selected === undefined) setInternalSelected(date)
    props.onSelect?.(date)
    if (date) {
      setOpen(false)
    }
  }

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.selected !== 'function' && !(typeof props.selected === 'object' && props.selected !== null && 'isEscaped' in props.selected)) __hydrateProps['selected'] = props.selected
  if (typeof props.formatDate !== 'function' && !(typeof props.formatDate === 'object' && props.formatDate !== null && 'isEscaped' in props.formatDate)) __hydrateProps['formatDate'] = props.formatDate
  if (typeof props.placeholder !== 'function' && !(typeof props.placeholder === 'object' && props.placeholder !== null && 'isEscaped' in props.placeholder)) __hydrateProps['placeholder'] = props.placeholder
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.disabledDates !== 'function' && !(typeof props.disabledDates === 'object' && props.disabledDates !== null && 'isEscaped' in props.disabledDates)) __hydrateProps['disabledDates'] = props.disabledDates
  if (typeof props.align !== 'function' && !(typeof props.align === 'object' && props.align !== null && 'isEscaped' in props.align)) __hydrateProps['align'] = props.align
  if (typeof props.triggerClassName !== 'function' && !(typeof props.triggerClassName === 'object' && props.triggerClassName !== null && 'isEscaped' in props.triggerClassName)) __hydrateProps['triggerClassName'] = props.triggerClassName
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="date-picker" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}><Popover open={open()} onOpenChange={setOpen} __instanceId={`${__scopeId}_s7`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s7'}><PopoverTrigger asChild __instanceId={`${__scopeId}_s4`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s4'}><Button variant="outline" className={`${triggerBaseClasses} ${!currentSelected() ? triggerPlaceholderClasses : ''} ${props.triggerClassName ?? ''}`} disabled={props.disabled ?? false} __instanceId={`${__scopeId}_s3`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s3'}><CalendarIcon className="size-4 mr-2" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /><span bf="^s2">{bfText("^s1")}{displayText()}{bfTextEnd()}</span></Button></PopoverTrigger><PopoverContent className="w-auto p-0" align={props.align ?? 'start'} __instanceId={`${__scopeId}_s6`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s6'}><Calendar mode="single" selected={currentSelected()} onSelect={handleSelect} disabled={props.disabledDates} __instanceId={`${__scopeId}_s5`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s5'} /></PopoverContent></Popover></div>
  )
}

export function DateRangePicker(__allProps: DateRangePickerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `DateRangePicker_${Math.random().toString(36).slice(2, 8)}`
  const open = () => false
  const setOpen = (..._args: any[]) => {}
  const displayText = () => {
    const range = props.selected
    const fmt = props.formatDate ?? defaultFormatDate
    if (range?.from) {
      if (range.to) {
        return `${fmt(range.from)} - ${fmt(range.to)}`
      }
      return fmt(range.from)
    }
    return props.placeholder ?? 'Pick a date range'
  }
  const handleSelect = (range: DateRange | undefined) => {
    props.onSelect?.(range)
    if (range?.from && range?.to) {
      setOpen(false)
    }
  }

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.selected !== 'function' && !(typeof props.selected === 'object' && props.selected !== null && 'isEscaped' in props.selected)) __hydrateProps['selected'] = props.selected
  if (typeof props.formatDate !== 'function' && !(typeof props.formatDate === 'object' && props.formatDate !== null && 'isEscaped' in props.formatDate)) __hydrateProps['formatDate'] = props.formatDate
  if (typeof props.placeholder !== 'function' && !(typeof props.placeholder === 'object' && props.placeholder !== null && 'isEscaped' in props.placeholder)) __hydrateProps['placeholder'] = props.placeholder
  if (typeof props.disabled !== 'function' && !(typeof props.disabled === 'object' && props.disabled !== null && 'isEscaped' in props.disabled)) __hydrateProps['disabled'] = props.disabled
  if (typeof props.disabledDates !== 'function' && !(typeof props.disabledDates === 'object' && props.disabledDates !== null && 'isEscaped' in props.disabledDates)) __hydrateProps['disabledDates'] = props.disabledDates
  if (typeof props.align !== 'function' && !(typeof props.align === 'object' && props.align !== null && 'isEscaped' in props.align)) __hydrateProps['align'] = props.align
  if (typeof props.numberOfMonths !== 'function' && !(typeof props.numberOfMonths === 'object' && props.numberOfMonths !== null && 'isEscaped' in props.numberOfMonths)) __hydrateProps['numberOfMonths'] = props.numberOfMonths
  if (typeof props.triggerClassName !== 'function' && !(typeof props.triggerClassName === 'object' && props.triggerClassName !== null && 'isEscaped' in props.triggerClassName)) __hydrateProps['triggerClassName'] = props.triggerClassName
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="date-range-picker" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}><Popover open={open()} onOpenChange={setOpen} __instanceId={`${__scopeId}_s7`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s7'}><PopoverTrigger asChild __instanceId={`${__scopeId}_s4`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s4'}><Button variant="outline" className={`${triggerBaseClasses} w-[300px] ${!props.selected?.from ? triggerPlaceholderClasses : ''} ${props.triggerClassName ?? ''}`} disabled={props.disabled ?? false} __instanceId={`${__scopeId}_s3`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s3'}><CalendarIcon className="size-4 mr-2" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /><span bf="^s2">{bfText("^s1")}{displayText()}{bfTextEnd()}</span></Button></PopoverTrigger><PopoverContent className="w-auto p-0" align={props.align ?? 'start'} __instanceId={`${__scopeId}_s6`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s6'}><Calendar mode="range" selected={props.selected} onSelect={handleSelect} disabled={props.disabledDates} numberOfMonths={props.numberOfMonths ?? 2} __instanceId={`${__scopeId}_s5`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s5'} /></PopoverContent></Popover></div>
  )
}