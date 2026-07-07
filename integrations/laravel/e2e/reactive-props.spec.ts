/**
 * ReactiveProps E2E tests for Laravel example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { reactivePropsTests } from '../../shared/e2e/reactive-props.spec'

reactivePropsTests('http://localhost:3016/integrations/laravel')
