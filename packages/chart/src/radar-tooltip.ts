import { useContext, createEffect, onCleanup } from '@barefootjs/dom'
import { RadarChartContext } from './context'

/**
 * Init function for RadarTooltip component.
 * Creates tooltip div and attaches mouse event listeners to radar dots.
 */
export function initRadarTooltip(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(RadarChartContext)
  const labelFormatter = props.labelFormatter as ((label: string) => string) | undefined

  let tooltip: HTMLDivElement | null = null
  let cleanupFn: (() => void) | null = null

  createEffect(() => {
    const g = ctx.svgGroup()
    const container = ctx.container()
    const rs = ctx.radialScale()
    if (!g || !container || !rs) return

    // Cleanup previous tooltip
    if (cleanupFn) {
      cleanupFn()
      cleanupFn = null
    }

    const data = ctx.data()
    const axisKey = ctx.dataKey()
    const radars = ctx.radars()
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
      if (target.tagName !== 'circle' || !target.hasAttribute('data-axis')) return

      const axisValue = target.getAttribute('data-axis') ?? ''
      const datum = data.find((d) => String(d[axisKey]) === axisValue)
      if (!datum) return

      const label = labelFormatter ? labelFormatter(axisValue) : axisValue

      let html = `<div style="font-weight:500;margin-bottom:4px">${label}</div>`
      for (const radar of radars) {
        const value = datum[radar.dataKey]
        const configEntry = config[radar.dataKey]
        const color = radar.fill ?? configEntry?.color ?? 'currentColor'
        const entryLabel = configEntry?.label ?? radar.dataKey
        html += `<div style="display:flex;align-items:center;gap:8px">`
        html += `<span style="width:8px;height:8px;border-radius:2px;background:${color};display:inline-block"></span>`
        html += `<span>${entryLabel}</span>`
        html += `<span style="font-weight:500;margin-left:auto">${value}</span>`
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
      if (target.tagName === 'circle') {
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
