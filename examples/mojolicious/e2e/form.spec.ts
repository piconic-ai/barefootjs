/**
 * Form E2E tests for Mojolicious example
 *
 * Uses shared test suite from examples/shared/e2e
 */

import { formTests } from '../../shared/e2e/form.spec'

formTests('http://localhost:3004')
