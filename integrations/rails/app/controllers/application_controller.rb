# frozen_string_literal: true

class ApplicationController < ActionController::Base
  include BarefootHelper

  # We assemble whole HTML documents ourselves (see BarefootHelper's ActionView
  # note); never look up a layout template.
  layout false

  # Stateless JSON API + hydration showcase — no CSRF tokens (matches Sinatra).
  skip_forgery_protection

  # Catch-all target for unmatched routes (config/routes.rb). Mirrors the
  # Sinatra example's plain-text not_found fallback.
  def not_found
    render plain: 'Not Found', status: :not_found
  end
end
