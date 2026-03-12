"use client"
/**
 * Radar Chart Props Playground
 *
 * Interactive playground for the RadarChart composed component.
 * Allows tweaking fill opacity, grid type, and grid visibility.
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  RadarTooltip,
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
 * Build highlighted JSX string for the composed RadarChart pattern.
 */
function buildHighlightedCode(fillOpacity: number, gridType: string, showGrid: boolean): string {
  const indent = '  '
  const lines: string[] = []

  lines.push(
    `${hlPlain('&lt;')}${hlTag('ChartContainer')} ${hlAttr('config')}${hlPlain('={chartConfig}')} ${hlAttr('className')}${hlPlain('=')}${hlStr('&quot;w-full&quot;')}${hlPlain('&gt;')}`
  )
  lines.push(
    `${indent}${hlPlain('&lt;')}${hlTag('RadarChart')} ${hlAttr('data')}${hlPlain('={chartData}')}${hlPlain('&gt;')}`
  )

  if (showGrid) {
    const gridTypeProp = gridType !== 'polygon'
      ? ` ${hlAttr('gridType')}${hlPlain('=')}${hlStr(`&quot;${gridType}&quot;`)}`
      : ''
    lines.push(
      `${indent}${indent}${hlPlain('&lt;')}${hlTag('PolarGrid')}${gridTypeProp} ${hlPlain('/&gt;')}`
    )
  }

  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('PolarAngleAxis')} ${hlAttr('dataKey')}${hlPlain('=')}${hlStr('&quot;month&quot;')} ${hlPlain('/&gt;')}`
  )
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('RadarTooltip')} ${hlPlain('/&gt;')}`
  )

  const opacityProp = fillOpacity !== 0.6
    ? ` ${hlAttr('fillOpacity')}${hlPlain('={' + fillOpacity + '}')}`
    : ''
  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('Radar')} ${hlAttr('dataKey')}${hlPlain('=')}${hlStr('&quot;desktop&quot;')} ${hlAttr('fill')}${hlPlain('=')}${hlStr('&quot;var(--color-desktop)&quot;')}${opacityProp} ${hlPlain('/&gt;')}`
  )

  lines.push(
    `${indent}${hlPlain('&lt;/')}${hlTag('RadarChart')}${hlPlain('&gt;')}`
  )
  lines.push(
    `${hlPlain('&lt;/')}${hlTag('ChartContainer')}${hlPlain('&gt;')}`
  )

  return lines.join('\n')
}

/**
 * Build plain-text JSX string for clipboard copy.
 */
function buildPlainCode(fillOpacity: number, gridType: string, showGrid: boolean): string {
  const indent = '  '
  const lines: string[] = []

  lines.push('<ChartContainer config={chartConfig} className="w-full">')
  lines.push(`${indent}<RadarChart data={chartData}>`)

  if (showGrid) {
    const gridTypeProp = gridType !== 'polygon' ? ` gridType="${gridType}"` : ''
    lines.push(`${indent}${indent}<PolarGrid${gridTypeProp} />`)
  }

  lines.push(`${indent}${indent}<PolarAngleAxis dataKey="month" />`)
  lines.push(`${indent}${indent}<RadarTooltip />`)

  const opacityProp = fillOpacity !== 0.6 ? ` fillOpacity={${fillOpacity}}` : ''
  lines.push(`${indent}${indent}<Radar dataKey="desktop" fill="var(--color-desktop)"${opacityProp} />`)

  lines.push(`${indent}</RadarChart>`)
  lines.push('</ChartContainer>')

  return lines.join('\n')
}

function RadarChartPlayground(_props: {}) {
  const [fillOpacity, setFillOpacity] = createSignal(0.6)
  const [gridType, setGridType] = createSignal('polygon')
  const [showGrid, setShowGrid] = createSignal(true)

  createEffect(() => {
    const o = fillOpacity()
    const t = gridType()
    const g = showGrid()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = buildHighlightedCode(o, t, g)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-radar-chart-preview"
      previewContent={
        <div className="w-full min-w-[300px]">
          <ChartContainer config={chartConfig} className="w-full">
            <RadarChart data={chartData}>
              <PolarGrid gridType={gridType() as 'polygon' | 'circle'} show={showGrid()} />
              <PolarAngleAxis dataKey="month" />
              <RadarTooltip />
              <Radar dataKey="desktop" fill={'var(--color-desktop)'} fillOpacity={fillOpacity()} />
            </RadarChart>
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
              <SelectItem value="0.2">0.2</SelectItem>
              <SelectItem value="0.4">0.4</SelectItem>
              <SelectItem value="0.6">0.6</SelectItem>
              <SelectItem value="0.8">0.8</SelectItem>
              <SelectItem value="1">1.0</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="gridType">
          <Select value={gridType()} onValueChange={(v: string) => setGridType(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select grid type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="polygon">polygon</SelectItem>
              <SelectItem value="circle">circle</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="showGrid">
          <Checkbox
            checked={showGrid()}
            onCheckedChange={(v: boolean) => setShowGrid(v)}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={buildPlainCode(fillOpacity(), gridType(), showGrid())} />}
    />
  )
}

export { RadarChartPlayground }
