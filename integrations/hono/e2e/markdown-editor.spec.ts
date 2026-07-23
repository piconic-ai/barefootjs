/**
 * Markdown Editor E2E tests for Hono example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { markdownEditorTests } from '../../shared/e2e/markdown-editor.spec'

markdownEditorTests('http://localhost:3001/integrations/hono')
