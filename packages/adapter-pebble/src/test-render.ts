/**
 * Real-backend render harness for the Pebble adapter conformance suite.
 *
 * Bun-only (exported solely under the `"bun"` condition — see
 * `package.json`'s `./test-render` export), so it never reaches a published
 * consumer's dependency graph.
 *
 * Stub for Phase 1 (#2101 package skeleton): only a toolchain probe exists
 * so far. The Java runtime and the prebuilt-jar harness (mirroring
 * `adapter-rust`'s compiled-target caching — build the fat jar ONCE, shell
 * out `java -jar` per fixture, never rebuild per fixture) land in a
 * follow-up PR in the same stack.
 */

/** Whether a `java` toolchain is on `PATH` — mirrors the sibling adapters'
 * "skip gracefully when the toolchain is missing" harness convention
 * (`RustNotAvailableError` in `adapter-rust/src/test-render.ts`, `elixir
 * --version` in the #2103 plan). Not yet consumed by a test runner — the
 * conformance-loop PR wires this into `onRenderError` skip logic. */
export function isJavaToolchainAvailable(): boolean {
  return Bun.which('java') !== null
}

export async function renderPebble(_template: string, _props: Record<string, unknown>): Promise<string> {
  throw new Error('renderPebble: not yet implemented (tracked in #2101 — lands with the Java runtime PR)')
}
