/**
 * The U step of the undefined rollout (spec/js-undefined-value.md, §6) that
 * owns each runtime's harness: the step that adds the runtime's undefined
 * value and empties its entries in the expected-failure ledgers
 * (`primitives-expected-failures.json`, `eval-expected-failures.json`). A
 * ledger entry whose `step` is a string must name its runtime's step here.
 */
export const UNDEFINED_STEP_BY_RUNTIME: Readonly<Record<string, string>> = {
  python: 'U2',
  rust: 'U3',
  ruby: 'U4',
  perl: 'U5',
  php: 'U6',
  java: 'U7',
  go: 'U8',
}

/** The runtimes that run the vector corpora, by ledger key. */
export const VECTOR_RUNTIMES: readonly string[] = Object.keys(UNDEFINED_STEP_BY_RUNTIME).sort()
