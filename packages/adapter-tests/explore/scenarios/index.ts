/**
 * The scenario roster the explorer sweeps (#3046). Add a scenario by
 * exporting it from its own file and listing it here; `explorer.test.ts`
 * / `scenarios.test.ts` and `scripts/explore-generate.ts` all read this
 * one list.
 */

import type { Scenario } from '../scenario'
import { keyedLoopInline } from './keyed-loop-inline'
import { childPropLoop } from './child-prop-loop'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SCENARIOS: ReadonlyArray<Scenario<any, string>> = [keyedLoopInline, childPropLoop]
