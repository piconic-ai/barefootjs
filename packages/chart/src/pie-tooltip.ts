import { useContext, createEffect, onCleanup } from '@barefootjs/dom'
import { PieChartContext } from './context'
import { escapeHtml } from './utils/escape-html'

/**
 * Init function for PieTooltip component.
 * Creates tooltip div and attaches mouse event listeners to pie slices.
 */
export function initPieTooltip(_scope: Element, props: Record<string, unknown>): void {
  const ctx = useContext(PieChartContext)
  const labelFormatter = props.labelFormatter as ((label: string) => string) | undefined

  let tooltip: HTMLDivElement | null = null
  let cleanupFn: (() => void) | null = null

  createEffect(() => {
    const g = ctx.svgGroup()
    const container = ctx.container()
    if (!g || !container) return

    // Cleanup previous tooltip
    if (cleanupFn) {
      cleanupFn()
      cleanupFn = null
    }

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
      if (target.tagName !== 'path' || !target.hasAttribute('data-name')) return

      const name = target.getAttribute('data-name') ?? ''
      const value = target.getAttribute('data-value') ?? ''
      const configEntry = config[name]
      const color = target.getAttribute('fill') ?? configEntry?.color ?? 'currentColor'
      const entryLabel = configEntry?.label ?? name

      const label = labelFormatter ? labelFormatter(name) : entryLabel

      let html = `<div style="display:flex;align-items:center;gap:8px">`
      html += `<span style="width:8px;height:8px;border-radius:2px;background:${escapeHtml(color)};display:inline-block"></span>`
      html += `<span>${escapeHtml(label)}</span>`
      html += `<span style="font-weight:500;margin-left:auto">${escapeHtml(value)}</span>`
      html += `</div>`
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
      if (target.tagName === 'path') {
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
