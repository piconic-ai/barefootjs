/**
 * QueryTodoApp mode-A E2E tests for the Rails example (`/todos-query`).
 */

import { queryTodoAppTests } from '../../shared/e2e/query-todo-app.spec'

queryTodoAppTests('http://localhost:3011/integrations/rails')
