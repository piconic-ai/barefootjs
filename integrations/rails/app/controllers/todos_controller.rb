# frozen_string_literal: true

# Todo page (with/without @client markers) + the session-cookie-backed,
# Mutex-guarded in-memory REST API. Direct port of the Sinatra example's todo
# routes.
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
    Barefoot::SESSIONS_MUTEX.synchronize do
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
    todo = Barefoot::SESSIONS_MUTEX.synchronize do
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
    Barefoot::SESSIONS_MUTEX.synchronize { session[:todos].reject! { |t| t[:id] == id } }
    head :no_content
  end

  def api_reset
    session = bf_session
    Barefoot::SESSIONS_MUTEX.synchronize do
      session[:todos] = Barefoot.seed_todos
      session[:next_id] = 4
    end
    render plain: 'ok'
  end
end
