import { useContext, createEffect, onCleanup } from '@barefootjs/dom'
import { BarChartContext } from './context'
import { escapeHtml } from './utils/escape-html'

/**
 * Init function for ChartTooltip component.
 * Creates tooltip div and attaches mouse event listeners.
 */
export function initChartTooltip(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(BarChartContext)
  const labelFormatter = props.labelFormatter as ((label: string) => string) | undefined

  let tooltip: HTMLDivElement | null = null
  let cleanupFn: (() => void) | null = null

  createEffect(() => {
    const g = ctx.svgGroup()
    const container = ctx.container()
    const xs = ctx.xScale()
    const ys = ctx.yScale()
    if (!g || !container || !xs || !ys) return

    // Cleanup previous tooltip
    if (cleanupFn) {
      cleanupFn()
      cleanupFn = null
    }

    const data = ctx.data()
    const xKey = ctx.xDataKey()
    const bars = ctx.bars()
    const config = ctx.config()

    tooltip = document.createElement('div')
    tooltip.className = 'chart-tooltip'
    Object.assign(tooltip.style, {
      position: 'absolute',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 150ms',
      backgroundColor: 'hsl(var(--popover))',
      color: 'hsl(var(--popover-foreground))',
      border: '1px solid hsl(var(--border))',
      borderRadius: '6px',
      padding: '8px 12px',
      fontSize: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      zIndex: '50',
      whiteSpace: 'nowrap',
    })
    container.style.position = 'relative'
    container.appendChild(tooltip)

    const currentTooltip = tooltip

    const handleMouseOver = (e: Event): void => {
      const target = e.target as SVGElement
      if (!target.hasAttribute('data-x')) return

      const xValue = target.getAttribute('data-x') ?? ''
      const datum = data.find((d) => String(d[xKey]) === xValue)
      if (!datum) return

      const label = labelFormatter ? labelFormatter(xValue) : xValue

      let html = `<div style="font-weight:500;margin-bottom:4px">${escapeHtml(label)}</div>`
      for (const bar of bars) {
        const value = datum[bar.dataKey]
        const configEntry = config[bar.dataKey]
        const color = bar.fill ?? configEntry?.color ?? 'currentColor'
        const entryLabel = configEntry?.label ?? bar.dataKey
        html += `<div style="display:flex;align-items:center;gap:8px">`
        html += `<span style="width:8px;height:8px;border-radius:2px;background:${escapeHtml(color)};display:inline-block"></span>`
        html += `<span>${escapeHtml(entryLabel)}</span>`
        html += `<span style="font-weight:500;margin-left:auto">${escapeHtml(value)}</span>`
        html += `</div>`
      }
      currentTooltip.innerHTML = html
      currentTooltip.style.opacity = '1'
    }

    const handleMouseMove = (e: MouseEvent): void => {
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left + 12
      const y = e.clientY - rect.top - 12
      currentTooltip.style.left = `${x}px`
      currentTooltip.style.top = `${y}px`
    }

    const handleMouseOut = (e: Event): void => {
      const target = e.target as SVGElement
      if (target.hasAttribute('data-x')) {
        currentTooltip.style.opacity = '0'
      }
    }

    g.addEventListener('mouseover', handleMouseOver)
    g.addEventListener('mousemove', handleMouseMove as EventListener)
    g.addEventListener('mouseout', handleMouseOut)

    cleanupFn = () => {
      g.removeEventListener('mouseover', handleMouseOver)
      g.removeEventListener('mousemove', handleMouseMove as EventListener)
      g.removeEventListener('mouseout', handleMouseOut)
      currentTooltip.remove()
    }
  })

  onCleanup(() => {
    if (cleanupFn) cleanupFn()
  })
}
