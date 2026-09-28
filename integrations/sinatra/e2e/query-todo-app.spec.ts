/**
 * QueryTodoApp mode-A E2E tests for the Sinatra example (`/todos-query`).
 */

import { queryTodoAppTests } from '../../shared/e2e/query-todo-app.spec'

queryTodoAppTests('http://localhost:3010/integrations/sinatra')
