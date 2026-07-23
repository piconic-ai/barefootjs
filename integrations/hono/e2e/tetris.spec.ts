/**
 * Tetris E2E tests for Hono example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { tetrisTests } from '../../shared/e2e/tetris.spec'

tetrisTests('http://localhost:3001/integrations/hono')
