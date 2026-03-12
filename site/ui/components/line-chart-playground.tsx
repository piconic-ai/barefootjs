"use client"
/**
 * Line Chart Props Playground
 *
 * Interactive playground for the LineChart composed component.
 * Allows tweaking stroke width, curve type, dot visibility, and grid.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import {
  hlPlain, hlTag, hlAttr, hlStr,
} from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Checkbox } from '@ui/components/ui/checkbox'
import {
  ChartContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  ChartTooltip,
} from '@ui/components/ui/chart'

const chartConfig: Record<string, { label: string; color: string }> = {
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
 * Build highlighted JSX string for the composed LineChart pattern.
 */
function buildHighlightedCode(strokeWidth: number, curveType: string, showDots: boolean, showGrid: boolean): string {
  const indent = '  '
  const lines: string[] = []

  lines.push(
    `${hlPlain('&lt;')}${hlTag('ChartContainer')} ${hlAttr('config')}${hlPlain('={chartConfig}')} ${hlAttr('className')}${hlPlain('=')}${hlStr('&quot;w-full&quot;')}${hlPlain('&gt;')}`
  )
  lines.push(
    `${indent}${hlPlain('&lt;')}${hlTag('LineChart')} ${hlAttr('data')}${hlPlain('={chartData}')}${hlPlain('&gt;')}`
  )

  if (showGrid) {
    lines.push(
      `${indent}${indent}${hlPlain('&lt;')}${hlTag('CartesianGrid')} ${hlAttr('vertical')}${hlPlain('={false}')} ${hlPlain('/&gt;')}`
    )
  }

  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('XAxis')} ${hlAttr('dataKey')}${hlPlain('=')}${hlStr('&quot;month&quot;')} ${hlPlain('/&gt;')}`
  )
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('YAxis')} ${hlPlain('/&gt;')}`
  )
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('ChartTooltip')} ${hlPlain('/&gt;')}`
  )

  const strokeWidthProp = strokeWidth !== 2
    ? ` ${hlAttr('strokeWidth')}${hlPlain('={' + strokeWidth + '}')}`
    : ''
  const typeProp = ` ${hlAttr('type')}${hlPlain('=')}${hlStr('&quot;' + curveType + '&quot;')}`
  const dotProp = !showDots
    ? ` ${hlAttr('dot')}${hlPlain('={false}')}`
    : ''
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('Line')} ${hlAttr('dataKey')}${hlPlain('=')}${hlStr('&quot;desktop&quot;')} ${hlAttr('stroke')}${hlPlain('=')}${hlStr('&quot;var(--color-desktop)&quot;')}${strokeWidthProp}${typeProp}${dotProp} ${hlPlain('/&gt;')}`
  )

  lines.push(
    `${indent}${hlPlain('&lt;/')}${hlTag('LineChart')}${hlPlain('&gt;')}`
  )
  lines.push(
    `${hlPlain('&lt;/')}${hlTag('ChartContainer')}${hlPlain('&gt;')}`
  )

  return lines.join('\n')
}

/**
 * Build plain-text JSX string for clipboard copy.
 */
function buildPlainCode(strokeWidth: number, curveType: string, showDots: boolean, showGrid: boolean): string {
  const indent = '  '
  const lines: string[] = []

  lines.push('<ChartContainer config={chartConfig} className="w-full">')
  lines.push(`${indent}<LineChart data={chartData}>`)

  if (showGrid) {
    lines.push(`${indent}${indent}<CartesianGrid vertical={false} />`)
  }

  lines.push(`${indent}${indent}<XAxis dataKey="month" />`)
  lines.push(`${indent}${indent}<YAxis />`)
  lines.push(`${indent}${indent}<ChartTooltip />`)

  const strokeWidthProp = strokeWidth !== 2 ? ` strokeWidth={${strokeWidth}}` : ''
  const typeProp = ` type="${curveType}"`
  const dotProp = !showDots ? ' dot={false}' : ''
  lines.push(`${indent}${indent}<Line dataKey="desktop" stroke="var(--color-desktop)"${strokeWidthProp}${typeProp}${dotProp} />`)

  lines.push(`${indent}</LineChart>`)
  lines.push('</ChartContainer>')

  return lines.join('\n')
}

function LineChartPlayground(_props: {}) {
  const [strokeWidth, setStrokeWidth] = createSignal(2)
  const [curveType, setCurveType] = createSignal('monotone')
  const [showDots, setShowDots] = createSignal(true)
  const [showGrid, setShowGrid] = createSignal(true)

  createEffect(() => {
    const sw = strokeWidth()
    const ct = curveType()
    const d = showDots()
    const g = showGrid()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = buildHighlightedCode(sw, ct, d, g)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-line-chart-preview"
      previewContent={
        <div className="w-full min-w-[300px]">
          <ChartContainer config={chartConfig} className="w-full">
            <LineChart data={chartData}>
              <CartesianGrid
                vertical={false}
                horizontal={showGrid()}
              />
              <XAxis dataKey="month" />
              <YAxis />
              <ChartTooltip />
              <Line
                dataKey="desktop"
                stroke={'var(--color-desktop)'}
                strokeWidth={strokeWidth()}
                type={curveType() as 'linear' | 'monotone'}
                dot={showDots()}
              />
            </LineChart>
          </ChartContainer>
        </div>
      }
      controls={<>
        <PlaygroundControl label="strokeWidth">
          <Select value={String(strokeWidth())} onValueChange={(v: string) => setStrokeWidth(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Select width..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="4">4</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="type">
          <Select value={curveType()} onValueChange={(v: string) => setCurveType(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monotone">monotone</SelectItem>
              <SelectItem value="linear">linear</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="dots">
          <Checkbox
            checked={showDots()}
            onCheckedChange={(v: boolean) => setShowDots(v)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="showGrid">
          <Checkbox
            checked={showGrid()}
            onCheckedChange={(v: boolean) => setShowGrid(v)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={buildPlainCode(strokeWidth(), curveType(), showDots(), showGrid())} />}
    />
  )
}

export { LineChartPlayground }
