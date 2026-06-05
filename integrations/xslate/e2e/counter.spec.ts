/**
 * Counter E2E tests for Text::Xslate example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { counterTests } from '../../shared/e2e/counter.spec'

counterTests('http://localhost:3007/integrations/xslate')
