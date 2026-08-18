/**
 * Hydration-props (bf-p) contract E2E tests for Django example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { hydrationPropsTests } from '../../shared/e2e/hydration-props.spec'

hydrationPropsTests('http://localhost:3014/integrations/django')
