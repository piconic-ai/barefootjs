/**
 * Portal E2E tests for Blade example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { portalTests } from '../../shared/e2e/portal.spec'

portalTests('http://localhost:3015/integrations/blade')
