# frozen_string_literal: true

# Rack entry point - Ruby port of the Sinatra example's config.ru: static
# assets + (dev) reload endpoint + the routed Rails app, all mounted under
# BASE. A bare-root request redirects into the base path.
#
# NOTE: keep this file's comments plain-ASCII. Rack::Builder#load_file scans
# the raw file bytes (File.read, tagged with the process's default external
# encoding) for a magic-comment BEFORE Ruby's own UTF-8 source parsing takes
# over; under a non-UTF-8 default external encoding (e.g. LANG unset / POSIX
# locale, common in minimal containers) a non-ASCII byte anywhere in the file
# makes that scan raise "invalid byte sequence in US-ASCII", regardless of any
# encoding comment. The rest of the app has no such restriction (loaded via
# plain require, which always parses as UTF-8) - only config.ru, because
# Rack::Builder pre-scans it specially.
require 'rack'
require_relative 'config/environment'

root = Rails.root

app = Rack::Builder.new do
  map "#{Barefoot::BASE}/client" do
    run Rack::Files.new(root.join('dist/client').to_s)
  end

  map "#{Barefoot::BASE}/styles" do
    run Rack::Files.new(root.join('dist/styles').to_s)
  end

  if Barefoot::DEV
    map "#{Barefoot::BASE}/_bf/reload" do
      run BarefootJS::DevReload.to_app(dist_dir: root.join('dist').to_s)
    end
  end

  map Barefoot::BASE do
    run Rails.application
  end

  map '/' do
    # Rack 3 requires lowercase header names (Rack::Lint enforces this in
    # development).
    run ->(_env) { [302, { 'location' => "#{Barefoot::BASE}/" }, []] }
  end
end

run app
