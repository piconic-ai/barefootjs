"use client"
/**
 * Calendar Usage Demo
 *
 * Client component wrapper for Calendar usage examples.
 * Needed because Calendar props (mode, fromDate, etc.) must be passed
 * from a client component for hydration to work correctly.
 */

import { Calendar } from '@ui/components/ui/calendar'

function CalendarUsageDemo(_props: {}) {
  const today = new Date()
  const thirtyDaysLater = new Date(today.getTime() + 30 * 86400000)

  return (
    <div className="flex flex-wrap gap-8">
      <Calendar mode="single" />
      <Calendar mode="range" numberOfMonths={2} />
      <Calendar mode="single" fromDate={today} toDate={thirtyDaysLater} />
    </div>
  )
}

export { CalendarUsageDemo }
