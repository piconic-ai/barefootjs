// Thrown for expected, user-actionable preview failures so callers can
// decide whether to exit (one-shot) or log and keep watching.
export class PreviewError extends Error {}
