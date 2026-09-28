/**
 * QueryTodoApp mode-A E2E tests for the Text::Xslate example (`/todos-query`).
 */

import { queryTodoAppTests } from '../../shared/e2e/query-todo-app.spec'

queryTodoAppTests('http://localhost:3007/integrations/xslate')
