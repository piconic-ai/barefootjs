/**
 * Toggle E2E tests for Flask example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { toggleTests } from '../../shared/e2e/toggle.spec'

toggleTests('http://localhost:3008/integrations/flask')
