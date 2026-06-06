/**
 * TodoAppSSR E2E tests for Text::Xslate example
 *
 * Tests TodoApp without @client markers
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3007/integrations/xslate', '/todos-ssr')
