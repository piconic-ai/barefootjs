/**
 * Toggle E2E tests for Echo example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { toggleTests } from '../../shared/e2e/toggle.spec'

toggleTests('http://localhost:8080/integrations/echo')
