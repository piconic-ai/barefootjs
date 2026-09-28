/**
 * QueryTodoApp mode-A E2E tests for the h3 example (`/todos-query`).
 */

import { queryTodoAppTests } from '../../shared/e2e/query-todo-app.spec'

queryTodoAppTests('http://localhost:3003/integrations/h3')
