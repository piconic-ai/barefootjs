import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'
import { spec as baseSpec } from './conditional-nested-loop-static-reactivity'

export const spec: SharedFixtureSpec = {
  ...baseSpec,
  id: 'conditional-nested-loop-precomputed-reactivity',
  componentName: 'ConditionalNestedPrecomputed',
  description: 'precomputed escape for conditional nested const loops retains reactive row bindings',
  props: { groups: ['a', 'b'], choices: ['1', '2'] },
}

export const fixture = defineSharedFixture(spec)
