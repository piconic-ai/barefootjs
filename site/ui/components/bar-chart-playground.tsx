"use client"
/**
 * Bar Chart Props Playground
 *
 * Interactive playground for the BarChart composed component.
 * Allows tweaking radius, vertical grid lines, and grid visibility.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import {
  hlPlain, hlTag, hlAttr, hlStr,
} from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Checkbox } from '@ui/components/ui/checkbox'
import type { ChartConfig } from '@barefootjs/chart'
import {
  ChartContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ChartTooltip,
} from '@ui/components/ui/chart'

const chartConfig: ChartConfig = {
  desktop: { label: "Desktop", color: "hsl(221 83% 53%)" },
}

const chartData = [
  { month: "Jan", desktop: 186 },
  { month: "Feb", desktop: 305 },
  { month: "Mar", desktop: 237 },
  { month: "Apr", desktop: 73 },
  { month: "May", desktop: 209 },
  { month: "Jun", desktop: 214 },
]

/**
 * Build highlighted JSX string for the composed BarChart pattern.
 */
function buildHighlightedCode(radius: number, vertical: boolean, showGrid: boolean): string {
  const indent = '  '
  const lines: string[] = []

  // <ChartContainer config={chartConfig} className="w-full">
  lines.push(
    `${hlPlain('&lt;')}${hlTag('ChartContainer')} ${hlAttr('config')}${hlPlain('={chartConfig}')} ${hlAttr('className')}${hlPlain('=')}${hlStr('&quot;w-full&quot;')}${hlPlain('&gt;')}`
  )
  // <BarChart data={chartData}>
  lines.push(
    `${indent}${hlPlain('&lt;')}${hlTag('BarChart')} ${hlAttr('data')}${hlPlain('={chartData}')}${hlPlain('&gt;')}`
  )

  // CartesianGrid (only if showGrid)
  if (showGrid) {
    const verticalProp = vertical
      ? ''
      : ` ${hlAttr('vertical')}${hlPlain('={false}')}`
    lines.push(
      `${indent}${indent}${hlPlain('&lt;')}${hlTag('CartesianGrid')}${verticalProp} ${hlPlain('/&gt;')}`
    )
  }

  // XAxis
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('XAxis')} ${hlAttr('dataKey')}${hlPlain('=')}${hlStr('&quot;month&quot;')} ${hlPlain('/&gt;')}`
  )
  // YAxis
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('YAxis')} ${hlPlain('/&gt;')}`
  )
  // ChartTooltip
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('ChartTooltip')} ${hlPlain('/&gt;')}`
  )

  // Bar
  const radiusProp = radius !== 0
    ? ` ${hlAttr('radius')}${hlPlain('={' + radius + '}')}`
    : ''
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('Bar')} ${hlAttr('dataKey')}${hlPlain('=')}${hlStr('&quot;desktop&quot;')} ${hlAttr('fill')}${hlPlain('=')}${hlStr('&quot;var(--color-desktop)&quot;')}${radiusProp} ${hlPlain('/&gt;')}`
  )

  // </BarChart>
  lines.push(
    `${indent}${hlPlain('&lt;/')}${hlTag('BarChart')}${hlPlain('&gt;')}`
  )
  // </ChartContainer>
  lines.push(
    `${hlPlain('&lt;/')}${hlTag('ChartContainer')}${hlPlain('&gt;')}`
  )

  return lines.join('\n')
}

/**
 * Build plain-text JSX string for clipboard copy.
 */
function buildPlainCode(radius: number, vertical: boolean, showGrid: boolean): string {
  const indent = '  '
  const lines: string[] = []

  lines.push('<ChartContainer config={chartConfig} className="w-full">')
  lines.push(`${indent}<BarChart data={chartData}>`)

  if (showGrid) {
    const verticalProp = vertical ? '' : ' vertical={false}'
    lines.push(`${indent}${indent}<CartesianGrid${verticalProp} />`)
  }

  lines.push(`${indent}${indent}<XAxis dataKey="month" />`)
  lines.push(`${indent}${indent}<YAxis />`)
  lines.push(`${indent}${indent}<ChartTooltip />`)

  const radiusProp = radius !== 0 ? ` radius={${radius}}` : ''
  lines.push(`${indent}${indent}<Bar dataKey="desktop" fill="var(--color-desktop)"${radiusProp} />`)

  lines.push(`${indent}</BarChart>`)
  lines.push('</ChartContainer>')

  return lines.join('\n')
}

function BarChartPlayground(_props: {}) {
  const [radius, setRadius] = createSignal(4)
  const [vertical, setVertical] = createSignal(false)
  const [showGrid, setShowGrid] = createSignal(true)

  createEffect(() => {
    const r = radius()
    const v = vertical()
    const g = showGrid()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = buildHighlightedCode(r, v, g)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-bar-chart-preview"
      previewContent={
        <div className="w-full min-w-[300px]">
          <ChartContainer config={chartConfig} className="w-full">
            <BarChart data={chartData}>
              {showGrid() ? <CartesianGrid vertical={vertical()} /> : null}
              <XAxis dataKey="month" />
              <YAxis />
              <ChartTooltip />
              <Bar dataKey="desktop" fill={'var(--color-desktop)'} radius={radius()} />
            </BarChart>
          </ChartContainer>
        </div>
      }
      controls={<>
        <PlaygroundControl label="radius">
          <Select value={String(radius())} onValueChange={(v: string) => setRadius(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Select radius..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="8">8</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="vertical grid">
          <Checkbox
            checked={vertical()}
            onCheckedChange={setVertical}
          />
        </PlaygroundControl>
        <PlaygroundControl label="showGrid">
          <Checkbox
            checked={showGrid()}
            onCheckedChange={setShowGrid}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={buildPlainCode(radius(), vertical(), showGrid())} />}
    />
  )
}

export { BarChartPlayground }
