# frozen_string_literal: true

class ApplicationController < ActionController::Base
  include BarefootHelper

  # We assemble whole HTML documents ourselves (see BarefootHelper's ActionView
  # note); never look up a layout template.
  layout false

  # Cache-Control for a session-free demo route: cacheable at the Workers
  # Cache layer regardless of a stale bf_session cookie the visitor's browser
  # may still be sending from an earlier /todos visit (that cookie's Path is
  # the whole integration, not /todos — see integrations/shared/lib/cache-control.ts).
  CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'

  # Stateless JSON API + hydration showcase — no CSRF tokens (matches Sinatra).
  skip_forgery_protection

  # Catch-all target for unmatched routes (config/routes.rb). Mirrors the
  # Sinatra example's plain-text not_found fallback.
  def not_found
    render plain: 'Not Found', status: :not_found
  end
end
