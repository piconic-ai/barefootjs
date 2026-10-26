/** Strict verification must not turn an unavailable backend into a passing test. */
export function canSkipRenderError(
  error: unknown,
  fixtureId: string,
  handler: ((error: Error, fixtureId: string) => boolean) | undefined,
): boolean {
  if (process.env.BF_REQUIRE_RENDER === '1') return false
  return error instanceof Error && (handler?.(error, fixtureId) ?? false)
}
