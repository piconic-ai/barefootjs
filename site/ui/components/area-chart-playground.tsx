"use client"
/**
 * Area Chart Props Playground
 *
 * Interactive playground for the AreaChart composed component.
 * Allows tweaking fillOpacity, vertical grid lines, and grid visibility.
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
  AreaChart,
  Area,
  AreaCartesianGrid,
  AreaXAxis,
  AreaYAxis,
  AreaChartTooltip,
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
 * Build highlighted JSX string for the composed AreaChart pattern.
 */
function buildHighlightedCode(fillOpacity: number, vertical: boolean, showGrid: boolean): string {
  const indent = '  '
  const lines: string[] = []

  lines.push(
    `${hlPlain('&lt;')}${hlTag('ChartContainer')} ${hlAttr('config')}${hlPlain('={chartConfig}')} ${hlAttr('className')}${hlPlain('=')}${hlStr('&quot;w-full&quot;')}${hlPlain('&gt;')}`
  )
  lines.push(
    `${indent}${hlPlain('&lt;')}${hlTag('AreaChart')} ${hlAttr('data')}${hlPlain('={chartData}')}${hlPlain('&gt;')}`
  )

  if (showGrid) {
    const verticalProp = vertical
      ? ''
      : ` ${hlAttr('vertical')}${hlPlain('={false}')}`
    lines.push(
      `${indent}${indent}${hlPlain('&lt;')}${hlTag('AreaCartesianGrid')}${verticalProp} ${hlPlain('/&gt;')}`
    )
  }

  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('AreaXAxis')} ${hlAttr('dataKey')}${hlPlain('=')}${hlStr('&quot;month&quot;')} ${hlPlain('/&gt;')}`
  )
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('AreaYAxis')} ${hlPlain('/&gt;')}`
  )
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('AreaChartTooltip')} ${hlPlain('/&gt;')}`
  )

  const opacityProp = fillOpacity !== 0.2
    ? ` ${hlAttr('fillOpacity')}${hlPlain('={' + fillOpacity + '}')}`
    : ''
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('Area')} ${hlAttr('dataKey')}${hlPlain('=')}${hlStr('&quot;desktop&quot;')} ${hlAttr('fill')}${hlPlain('=')}${hlStr('&quot;var(--color-desktop)&quot;')} ${hlAttr('stroke')}${hlPlain('=')}${hlStr('&quot;var(--color-desktop)&quot;')}${opacityProp} ${hlPlain('/&gt;')}`
  )

  lines.push(
    `${indent}${hlPlain('&lt;/')}${hlTag('AreaChart')}${hlPlain('&gt;')}`
  )
  lines.push(
    `${hlPlain('&lt;/')}${hlTag('ChartContainer')}${hlPlain('&gt;')}`
  )

  return lines.join('\n')
}

/**
 * Build plain-text JSX string for clipboard copy.
 */
function buildPlainCode(fillOpacity: number, vertical: boolean, showGrid: boolean): string {
  const indent = '  '
  const lines: string[] = []

  lines.push('<ChartContainer config={chartConfig} className="w-full">')
  lines.push(`${indent}<AreaChart data={chartData}>`)

  if (showGrid) {
    const verticalProp = vertical ? '' : ' vertical={false}'
    lines.push(`${indent}${indent}<AreaCartesianGrid${verticalProp} />`)
  }

  lines.push(`${indent}${indent}<AreaXAxis dataKey="month" />`)
  lines.push(`${indent}${indent}<AreaYAxis />`)
  lines.push(`${indent}${indent}<AreaChartTooltip />`)

  const opacityProp = fillOpacity !== 0.2 ? ` fillOpacity={${fillOpacity}}` : ''
  lines.push(`${indent}${indent}<Area dataKey="desktop" fill="var(--color-desktop)" stroke="var(--color-desktop)"${opacityProp} />`)

  lines.push(`${indent}</AreaChart>`)
  lines.push('</ChartContainer>')

  return lines.join('\n')
}

function AreaChartPlayground(_props: {}) {
  const [fillOpacity, setFillOpacity] = createSignal(0.2)
  const [vertical, setVertical] = createSignal(false)
  const [showGrid, setShowGrid] = createSignal(true)

  createEffect(() => {
    const o = fillOpacity()
    const v = vertical()
    const g = showGrid()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = buildHighlightedCode(o, v, g)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-area-chart-preview"
      previewContent={
        <div className="w-full min-w-[300px]">
          <ChartContainer config={chartConfig} className="w-full">
            <AreaChart data={chartData}>
              <AreaCartesianGrid
                vertical={vertical()}
                horizontal={showGrid()}
              />
              <AreaXAxis dataKey="month" />
              <AreaYAxis />
              <AreaChartTooltip />
              <Area dataKey="desktop" fill={'var(--color-desktop)'} stroke={'var(--color-desktop)'} fillOpacity={fillOpacity()} />
            </AreaChart>
          </ChartContainer>
        </div>
      }
      controls={<>
        <PlaygroundControl label="fillOpacity">
          <Select value={String(fillOpacity())} onValueChange={(v: string) => setFillOpacity(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Select opacity..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.1">0.1</SelectItem>
              <SelectItem value="0.2">0.2</SelectItem>
              <SelectItem value="0.4">0.4</SelectItem>
              <SelectItem value="0.6">0.6</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="vertical grid">
          <Checkbox
            checked={vertical()}
            onCheckedChange={(v: boolean) => setVertical(v)}
          />
        </PlaygroundControl>
        <PlaygroundControl label="showGrid">
          <Checkbox
            checked={showGrid()}
            onCheckedChange={(v: boolean) => setShowGrid(v)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={buildPlainCode(fillOpacity(), vertical(), showGrid())} />}
    />
  )
}

export { AreaChartPlayground }
