/**
 * ConditionalReturn E2E tests for Text::Xslate example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { conditionalReturnTests } from '../../shared/e2e/conditional-return.spec'

conditionalReturnTests('http://localhost:3007/integrations/xslate')
