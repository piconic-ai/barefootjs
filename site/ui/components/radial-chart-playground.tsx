"use client"
/**
 * Radial Chart Props Playground
 *
 * Interactive playground for the RadialChart composed component.
 * Allows tweaking innerRadius, endAngle, and data count.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import {
  hlPlain, hlTag, hlAttr, hlStr,
} from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import {
  ChartContainer,
  RadialChart,
  RadialBar,
} from '@ui/components/ui/chart'

const chartConfig: Record<string, { label: string; color: string }> = {
  safari: { label: "Safari", color: "hsl(221 83% 53%)" },
  chrome: { label: "Chrome", color: "hsl(142 76% 36%)" },
  firefox: { label: "Firefox", color: "hsl(38 92% 50%)" },
  edge: { label: "Edge", color: "hsl(280 65% 60%)" },
  other: { label: "Other", color: "hsl(340 75% 55%)" },
}

const chartData = [
  { browser: "safari", visitors: 200, fill: "var(--color-safari)" },
  { browser: "chrome", visitors: 275, fill: "var(--color-chrome)" },
  { browser: "firefox", visitors: 187, fill: "var(--color-firefox)" },
  { browser: "edge", visitors: 173, fill: "var(--color-edge)" },
  { browser: "other", visitors: 90, fill: "var(--color-other)" },
]

/**
 * Build highlighted JSX string for the composed RadialChart pattern.
 */
function buildHighlightedCode(innerRadius: number, endAngle: number): string {
  const indent = '  '
  const lines: string[] = []

  lines.push(
    `${hlPlain('&lt;')}${hlTag('ChartContainer')} ${hlAttr('config')}${hlPlain('={chartConfig}')} ${hlAttr('className')}${hlPlain('=')}${hlStr('&quot;w-full&quot;')}${hlPlain('&gt;')}`
  )

  const innerProp = innerRadius !== 50
    ? ` ${hlAttr('innerRadius')}${hlPlain('={' + innerRadius + '}')}`
    : ''
  const endProp = endAngle !== 360
    ? ` ${hlAttr('endAngle')}${hlPlain('={' + endAngle + '}')}`
    : ''
  lines.push(
    `${indent}${hlPlain('&lt;')}${hlTag('RadialChart')} ${hlAttr('data')}${hlPlain('={chartData}')}${innerProp}${endProp}${hlPlain('&gt;')}`
  )

  lines.push(
    `${indent}${indent}${hlPlain('&lt;')}${hlTag('RadialBar')} ${hlAttr('dataKey')}${hlPlain('=')}${hlStr('&quot;visitors&quot;')} ${hlPlain('/&gt;')}`
  )

  lines.push(
    `${indent}${hlPlain('&lt;/')}${hlTag('RadialChart')}${hlPlain('&gt;')}`
  )
  lines.push(
    `${hlPlain('&lt;/')}${hlTag('ChartContainer')}${hlPlain('&gt;')}`
  )

  return lines.join('\n')
}

/**
 * Build plain-text JSX string for clipboard copy.
 */
function buildPlainCode(innerRadius: number, endAngle: number): string {
  const indent = '  '
  const lines: string[] = []

  lines.push('<ChartContainer config={chartConfig} className="w-full">')

  const innerProp = innerRadius !== 50 ? ` innerRadius={${innerRadius}}` : ''
  const endProp = endAngle !== 360 ? ` endAngle={${endAngle}}` : ''
  lines.push(`${indent}<RadialChart data={chartData}${innerProp}${endProp}>`)

  lines.push(`${indent}${indent}<RadialBar dataKey="visitors" />`)

  lines.push(`${indent}</RadialChart>`)
  lines.push('</ChartContainer>')

  return lines.join('\n')
}

function RadialChartPlayground(_props: {}) {
  const [innerRadius, setInnerRadius] = createSignal(50)
  const [endAngle, setEndAngle] = createSignal(360)

  createEffect(() => {
    const ir = innerRadius()
    const ea = endAngle()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = buildHighlightedCode(ir, ea)
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-radial-chart-preview"
      previewContent={
        <div className="w-full min-w-[300px]">
          <ChartContainer config={chartConfig} className="w-full">
            <RadialChart data={chartData} innerRadius={innerRadius()} outerRadius={110} endAngle={endAngle()}>
              <RadialBar dataKey="visitors" />
            </RadialChart>
          </ChartContainer>
        </div>
      }
      controls={<>
        <PlaygroundControl label="innerRadius">
          <Select value={String(innerRadius())} onValueChange={(v: string) => setInnerRadius(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Select inner radius..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0</SelectItem>
              <SelectItem value="30">30</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="70">70</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="endAngle">
          <Select value={String(endAngle())} onValueChange={(v: string) => setEndAngle(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Select end angle..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="180">180 (half)</SelectItem>
              <SelectItem value="270">270</SelectItem>
              <SelectItem value="360">360 (full)</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={buildPlainCode(innerRadius(), endAngle())} />}
    />
  )
}

export { RadialChartPlayground }
