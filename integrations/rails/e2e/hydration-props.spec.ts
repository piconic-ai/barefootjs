/**
 * Hydration-props (bf-p) contract E2E tests for Rails example
 *
 * Uses shared test suite from integrations/shared/e2e. Rails has no
 * browser-driven E2E CI job (see the ERB adapter's CI workflow), so this
 * file exists for local/manual runs only — matching the other shared
 * specs (e.g. toggle.spec.ts), which are wired up here for the same
 * reason even though CI never exercises them.
 */

import { hydrationPropsTests } from '../../shared/e2e/hydration-props.spec'

hydrationPropsTests('http://localhost:3011/integrations/rails')
