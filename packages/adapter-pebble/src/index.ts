/**
 * BarefootJS Pebble Template Adapter
 *
 * Generates Pebble template files (.peb) from BarefootJS IR, for the JVM
 * ecosystem (Spring Boot, Ktor, plain Servlet apps).
 */

export { PebbleAdapter, pebbleAdapter } from './adapter/index.ts'
export type { PebbleAdapterOptions } from './adapter/index.ts'
export { conformancePins } from './conformance-pins.ts'
export { renderDivergences } from './render-divergences.ts'
