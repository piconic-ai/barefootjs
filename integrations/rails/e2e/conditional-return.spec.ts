/**
 * ConditionalReturn E2E tests for Rails example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { conditionalReturnTests } from '../../shared/e2e/conditional-return.spec'

conditionalReturnTests('http://localhost:3011/integrations/rails')
