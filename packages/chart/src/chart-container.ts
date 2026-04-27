import type { ChartConfig } from './types'

/**
 * Apply CSS variables from ChartConfig to a container element.
 * Sets --color-{key} for each config entry.
 *
 * Reused by the JSX-native `ChartContainer` ref callback in
 * `ui/components/ui/chart/index.tsx`.
 */
export function applyChartCSSVariables(
  container: HTMLElement,
  config: ChartConfig,
): void {
  for (const [key, value] of Object.entries(config)) {
    container.style.setProperty(`--color-${key}`, value.color)
  }
}
