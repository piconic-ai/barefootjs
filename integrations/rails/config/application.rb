# frozen_string_literal: true

require_relative 'boot'

# Hand-trimmed Rails boot: pull in ONLY the frameworks this example uses.
# `require "rails"` + `require "action_controller/railtie"` gives routing +
# controllers (and, transitively, ActiveSupport / ActionView) — but nothing
# else. ActiveRecord, ActionMailer, ActiveJob, ActionCable, ActiveStorage and
# the asset pipeline (sprockets/propshaft) are deliberately NOT required: this
# app has no database, no mail, no background jobs, no websockets, and serves
# its already-built client assets straight from `dist/` via Rack (see
# config.ru), so pulling those frameworks in would be dead weight.
require 'rails'
require 'action_controller/railtie'

module RailsExample
  class Application < Rails::Application
    config.load_defaults 8.0

    # Serve requests in-process (no separate worker frameworks loaded above).
    config.api_only = false

    # `dist/` assets (client JS, styles) and the dev-reload SSE endpoint are
    # mounted by config.ru's Rack::Builder ahead of the Rails app, so Rails'
    # own static file server stays off — there is no `public/` tree to serve.
    config.public_file_server.enabled = false

    # This is a stateless showcase: the todo REST API is called with JSON from
    # the client islands and carries no CSRF token (mirrors the Sinatra
    # example, which has no forgery protection at all). Disable it globally.
    config.action_controller.default_protect_from_forgery = false

    # secret_key_base is required for the app to boot even though this example
    # only sets a plain, unsigned `bf_session` cookie. A fixed dev fallback
    # keeps local runs zero-config; production reads it from the environment.
    config.secret_key_base = ENV.fetch('SECRET_KEY_BASE', 'barefootjs-rails-example-development-secret-key-base-0000000000')

    config.eager_load = Rails.env.production?
    config.consider_all_requests_local = !Rails.env.production?
    config.logger = Logger.new($stdout)
    config.log_level = Rails.env.production? ? :info : :debug

    # No generators / autoload of `lib/`: the BarefootJS Ruby runtime under
    # `lib/` uses non-Zeitwerk file names (barefoot_js.rb -> BarefootJS), so it
    # is loaded explicitly via $LOAD_PATH in config/initializers/barefoot.rb,
    # never autoloaded.
  end
end
