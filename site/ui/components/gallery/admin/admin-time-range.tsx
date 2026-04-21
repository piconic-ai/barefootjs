"use client"

import { createSignal, createEffect } from '@barefootjs/client'
import {
  TIME_RANGE_LABELS,
  readTimeRange,
  writeTimeRange,
  type TimeRange,
} from '../../shared/gallery-admin-storage'

const ranges: TimeRange[] = ['7d', '30d', '90d']

export function AdminTimeRange() {
  const [timeRange, setTimeRange] = createSignal<TimeRange>(readTimeRange())

  createEffect(() => {
    writeTimeRange(timeRange())
  })

  return (
    <div className="admin-time-range inline-flex items-center gap-1 rounded-md border bg-background p-1 text-sm">
      {ranges.map((value) => (
        <button
          type="button"
          data-range={value}
          data-active={timeRange() === value ? 'true' : 'false'}
          onClick={() => setTimeRange(value)}
          className={`px-3 py-1 rounded transition-colors ${
            timeRange() === value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {TIME_RANGE_LABELS[value]}
        </button>
      ))}
    </div>
  )
}
