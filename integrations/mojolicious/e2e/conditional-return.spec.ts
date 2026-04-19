/**
 * ConditionalReturn E2E tests for Mojolicious example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { conditionalReturnTests } from '../../shared/e2e/conditional-return.spec'

conditionalReturnTests('http://localhost:3004/integrations/mojolicious')
