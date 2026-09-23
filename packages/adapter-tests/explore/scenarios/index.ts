/**
 * The scenario roster the explorer sweeps (#3046). Add a scenario by
 * exporting it from its own file and listing it here; `explorer.test.ts`
 * / `scenarios.test.ts` and `scripts/explore-generate.ts` all read this
 * one list.
 */

import type { Scenario } from '../scenario'
import { keyedLoopInline } from './keyed-loop-inline'
import { childPropLoop } from './child-prop-loop'
import { conditionalToggle } from './conditional-toggle'
import { childMountUnmount } from './child-mount-unmount'
import { childPropSlots } from './child-prop-slots'
import { commentRootChildSlot } from './comment-root-child-slot'
import { keyedLoopPositions } from './keyed-loop-positions'
import { childPropLoopPositions } from './child-prop-loop-positions'
import { fragmentRootToggle } from './fragment-root-toggle'
import { childListenerCleanup } from './child-listener-cleanup'
import { childEffectDisposal } from './child-effect-disposal'
import { nestedLoop } from './nested-loop'
import { grandchildPropChain } from './grandchild-prop-chain'
import { loopRowHandlers } from './loop-row-handlers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SCENARIOS: ReadonlyArray<Scenario<any, string>> = [
  keyedLoopInline,
  childPropLoop,
  conditionalToggle,
  childMountUnmount,
  childPropSlots,
  commentRootChildSlot,
  keyedLoopPositions,
  childPropLoopPositions,
  fragmentRootToggle,
  childListenerCleanup,
  childEffectDisposal,
  nestedLoop,
  grandchildPropChain,
  loopRowHandlers,
]
