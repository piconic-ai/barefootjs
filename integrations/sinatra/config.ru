# frozen_string_literal: true

# Rack entry point - Ruby port of integrations/xslate's app.psgi `builder`
# block: static assets + (dev) reload endpoint + the routed Sinatra app, all
# under BASE. A bare-root request redirects into the base path.
#
# NOTE: keep this file's comments plain-ASCII. Rack::Builder#load_file scans
# the raw file bytes (`File.read`, tagged with the process's default external
# encoding) for a magic-comment BEFORE Ruby's own UTF-8 source parsing takes
# over; under a non-UTF-8 default external encoding (e.g. LANG unset / POSIX
# locale, common in minimal containers) a non-ASCII byte anywhere in the file
# makes that scan raise `invalid byte sequence in US-ASCII`, regardless of
# any encoding comment. app.rb has no such restriction (it's loaded via plain
# `require_relative`, which always parses as UTF-8 per Ruby's language
# default) - only config.ru, because Rack::Builder pre-scans it specially.
require 'rack'
require_relative 'app'

app = Rack::Builder.new do
  map "#{BASE}/client" do
    run Rack::Files.new(File.join(SinatraApp.settings.root, 'dist/client'))
  end

  map "#{BASE}/styles" do
    run Rack::Files.new(File.join(SinatraApp.settings.root, 'dist/styles'))
  end

  if DEV
    map "#{BASE}/_bf/reload" do
      run BarefootJS::DevReload.to_app(dist_dir: File.join(SinatraApp.settings.root, 'dist'))
    end
  end

  map BASE do
    run SinatraApp
  end

  map '/' do
    # Rack 3 requires lowercase header names (Rack::Lint enforces this in
    # development).
    run ->(_env) { [302, { 'location' => "#{BASE}/" }, []] }
  end
end

run app
