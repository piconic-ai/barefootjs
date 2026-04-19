/**
 * ReactiveProps E2E tests for Echo example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { reactivePropsTests } from '../../shared/e2e/reactive-props.spec'

reactivePropsTests('http://localhost:8080/integrations/echo')
