/**
 * ReactiveProps E2E tests for the Axum example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { reactivePropsTests } from '../../shared/e2e/reactive-props.spec'

reactivePropsTests('http://localhost:3012/integrations/axum')
