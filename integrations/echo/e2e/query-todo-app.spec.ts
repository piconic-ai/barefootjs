/**
 * QueryTodoApp mode-A E2E tests for the Echo example (`/todos-query`).
 */

import { queryTodoAppTests } from '../../shared/e2e/query-todo-app.spec'

queryTodoAppTests('http://localhost:8080/integrations/echo')
