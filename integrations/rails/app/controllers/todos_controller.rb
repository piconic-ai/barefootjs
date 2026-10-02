# frozen_string_literal: true

# Todo pages (with/without @client markers, and the createQuery version) +
# the session-cookie-backed, Mutex-guarded in-memory REST API. Direct port of
# the Sinatra example's todo routes.
class TodosController < ApplicationController
  def index
    session = bf_session
    todos = session[:todos].map(&:dup)
    done = todos.count { |t| t[:done] }
    component = params[:ssr] ? 'TodoAppSSR' : 'TodoApp'
    render_component(component,
                     children: { 'todo_item' => 'TodoItem' },
                     props: { initialTodos: todos },
                     stash: { todos: todos, newText: '', filter: 'all', doneCount: done })
  end

  # The createQuery / createMutation todo app. `initialTodos` seeds its query
  # (mode A): the list is rendered here, and the client sends no request on
  # mount. Writes go through the API below and re-fetch the list.
  def query
    session = bf_session
    todos = ExampleApp::SESSIONS_MUTEX.synchronize { session[:todos].map { |t| t.slice(:id, :text, :done) } }
    render_component('QueryTodoApp',
                     title: 'TodoMVC (createQuery) - BarefootJS',
                     children: { 'query_todo_item' => 'QueryTodoItem' },
                     props: { initialTodos: todos },
                     stash: { newText: '', filter: 'all' })
  end

  # --- todo REST API ---
  def api_index
    render json: bf_session[:todos]
  end

  def api_create
    session = bf_session
    input = parse_json_body
    todo = nil
    # id assignment + increment must be atomic together (Puma is threaded) or
    # two concurrent POSTs could read the same next_id before either increments.
    ExampleApp::SESSIONS_MUTEX.synchronize do
      todo = { id: session[:next_id], text: input[:text], done: false, editing: false }
      session[:todos].push(todo)
      session[:next_id] += 1
    end
    render json: todo, status: :created
  end

  def api_update
    session = bf_session
    input = parse_json_body
    id = params[:id].to_i
    todo = ExampleApp::SESSIONS_MUTEX.synchronize do
      t = session[:todos].find { |x| x[:id] == id }
      next nil unless t

      t[:text] = input[:text] if input.key?(:text)
      t[:done] = !!input[:done] if input.key?(:done)
      t
    end
    return render json: { error: 'not found' }, status: :not_found unless todo

    render json: todo
  end

  def api_destroy
    session = bf_session
    id = params[:id].to_i
    ExampleApp::SESSIONS_MUTEX.synchronize { session[:todos].reject! { |t| t[:id] == id } }
    head :no_content
  end

  # "Toggle all" on /todos-query: sets every todo's done flag.
  def api_set_all_done
    session = bf_session
    done = !!parse_json_body[:done]
    todos = ExampleApp::SESSIONS_MUTEX.synchronize do
      session[:todos].each { |t| t[:done] = done }
      session[:todos].map(&:dup)
    end
    render json: todos
  end

  # "Clear completed" on /todos-query: removes every done todo.
  def api_clear_completed
    session = bf_session
    ExampleApp::SESSIONS_MUTEX.synchronize { session[:todos].reject! { |t| t[:done] } }
    head :no_content
  end

  def api_reset
    session = bf_session
    ExampleApp::SESSIONS_MUTEX.synchronize do
      session[:todos] = ExampleApp.seed_todos
      session[:next_id] = 4
    end
    render plain: 'ok'
  end
end
