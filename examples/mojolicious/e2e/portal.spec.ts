/**
 * Portal E2E tests for Mojolicious example
 *
 * Uses shared test suite from examples/shared/e2e
 */

import { portalTests } from '../../shared/e2e/portal.spec'

portalTests('http://localhost:3004')
