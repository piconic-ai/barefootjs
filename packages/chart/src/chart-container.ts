import { provideContext } from '@barefootjs/dom'
import { ChartConfigContext } from './context'
import type { ChartConfig } from './types'

/**
 * Apply CSS variables from ChartConfig to a container element.
 * Sets --color-{key} for each config entry.
 */
export function applyChartCSSVariables(
  container: HTMLElement,
  config: ChartConfig,
): void {
  for (const [key, value] of Object.entries(config)) {
    container.style.setProperty(`--color-${key}`, value.color)
  }
}

/**
 * Init function for ChartContainer component.
 * Applies CSS variables, sets foreground color, and provides config via context.
 */
export function initChartContainer(scope: Element, props: Record<string, unknown>): void {
  const el = scope as HTMLElement
  const config = (props.config as ChartConfig) ?? {}
  applyChartCSSVariables(el, config)
  el.style.color = 'hsl(var(--foreground))'
  provideContext(ChartConfigContext, { config })
}
