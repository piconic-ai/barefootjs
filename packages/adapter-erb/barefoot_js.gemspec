# frozen_string_literal: true

require 'json'

pkg = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Gem::Specification.new do |s|
  s.name        = 'barefoot_js'
  s.version     = pkg['version']
  s.summary     = 'Ruby runtime for the @barefootjs/erb adapter'
  s.description = 'Engine-agnostic BarefootJS server runtime targeting ERB, ' \
                  'ported from packages/adapter-perl/lib/BarefootJS.pm.'
  s.authors     = ['kobaken']
  s.email       = ['kentafly88@gmail.com']
  s.homepage    = 'https://github.com/piconic-ai/barefootjs'
  s.license     = 'MIT'

  s.required_ruby_version = '>= 3.1'

  s.files = Dir['lib/**/*.rb'] + %w[README.md]

  # #2344: named-IANA-zone resolution in `format_date` (tzdata via TZInfo;
  # falls back to the system zoneinfo directory when tzinfo-data isn't
  # installed). Loaded lazily — every other helper stays stdlib-only.
  s.add_dependency 'tzinfo', '~> 2.0'

  # Test-only. Declared here rather than in the Gemfile so the gemspec stays
  # the one place dependencies are listed. minitest ships with Ruby but is a
  # bundled gem, not a default one, so it is not on the load path under
  # `bundle exec` unless the bundle asks for it.
  s.add_development_dependency 'minitest', '~> 5.0'

  s.metadata['documentation_uri'] = 'https://barefootjs.dev'
  s.metadata['source_code_uri'] = 'https://github.com/piconic-ai/barefootjs/tree/main/packages/adapter-erb'
  s.metadata['rubygems_mfa_required'] = 'true'
end
