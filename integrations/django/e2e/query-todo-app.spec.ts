/**
 * QueryTodoApp mode-A E2E tests for the Django example (`/todos-query`).
 */

import { queryTodoAppTests } from '../../shared/e2e/query-todo-app.spec'

queryTodoAppTests('http://localhost:3014/integrations/django')
