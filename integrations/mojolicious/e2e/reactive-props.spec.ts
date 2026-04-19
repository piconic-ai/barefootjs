/**
 * ReactiveProps E2E tests for Mojolicious example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { reactivePropsTests } from '../../shared/e2e/reactive-props.spec'

reactivePropsTests('http://localhost:3004/integrations/mojolicious')
