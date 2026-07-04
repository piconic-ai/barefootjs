/**
 * Form E2E tests for PHP example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { formTests } from '../../shared/e2e/form.spec'

formTests('http://localhost:3013/integrations/php')
