/**
 * Counter E2E tests for Mojolicious example
 *
 * Uses shared test suite from examples/shared/e2e
 */

import { counterTests } from '../../shared/e2e/counter.spec'

counterTests('http://localhost:3004')
