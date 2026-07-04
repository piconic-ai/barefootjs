/**
 * Counter E2E tests for the Axum example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { counterTests } from '../../shared/e2e/counter.spec'

counterTests('http://localhost:3012/integrations/axum')
