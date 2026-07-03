# frozen_string_literal: true

# Routes are defined WITHOUT the BASE prefix: config.ru mounts the whole Rails
# app under BASE (`map "#{ExampleApp::BASE}" { run Rails.application }`), which
# strips the prefix from PATH_INFO before Rails routing sees it — exactly how
# the Sinatra example's config.ru works. Hrefs in the rendered HTML are still
# written with the BASE prefix (see BarefootHelper), so nothing here relies on
# url helpers.
Rails.application.routes.draw do
  root to: 'pages#index'

  get 'counter', to: 'pages#counter'
  get 'toggle', to: 'pages#toggle'
  get 'form', to: 'pages#form'
  get 'reactive-props', to: 'pages#reactive_props'
  get 'conditional-return', to: 'pages#conditional_return'
  get 'conditional-return-link', to: 'pages#conditional_return', defaults: { link: '1' }
  get 'props-reactivity', to: 'pages#props_reactivity'
  get 'portal', to: 'pages#portal'
  get 'ai-chat', to: 'pages#ai_chat'

  # AI chat SSE stream — its own ActionController::Live controller.
  get 'api/ai-chat', to: 'ai_chat#stream'

  # Todo pages (with/without @client markers) + the session-cookie REST API.
  get 'todos', to: 'todos#index'
  get 'todos-ssr', to: 'todos#index', defaults: { ssr: '1' }
  get 'api/todos', to: 'todos#api_index'
  post 'api/todos', to: 'todos#api_create'
  post 'api/todos/reset', to: 'todos#api_reset'
  put 'api/todos/:id', to: 'todos#api_update'
  delete 'api/todos/:id', to: 'todos#api_destroy'

  # Blog — the @barefootjs/router showcase.
  get 'blog', to: 'blog#index'
  get 'blog/posts/:slug', to: 'blog#post'

  # Plain-text 404 for anything else (mirrors the Sinatra example's not_found
  # fallback). API routes emit their own JSON 404s before reaching here.
  match '*path', to: 'application#not_found', via: :all
end
