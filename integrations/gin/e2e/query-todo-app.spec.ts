/**
 * QueryTodoApp mode-A E2E tests for the Gin example (`/todos-query`).
 */

import { queryTodoAppTests } from '../../shared/e2e/query-todo-app.spec'

queryTodoAppTests('http://localhost:8081/integrations/gin')
