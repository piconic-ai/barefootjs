/**
 * ReactiveProps E2E tests for Blade example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { reactivePropsTests } from '../../shared/e2e/reactive-props.spec'

reactivePropsTests('http://localhost:3015/integrations/blade')
