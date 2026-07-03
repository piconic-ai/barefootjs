/**
 * ConditionalReturn E2E tests for Sinatra example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { conditionalReturnTests } from '../../shared/e2e/conditional-return.spec'

conditionalReturnTests('http://localhost:3010/integrations/sinatra')
