# frozen_string_literal: true

require 'json'

pkg = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Gem::Specification.new do |s|
  s.name        = 'barefootjs'
  s.version     = pkg['version']
  s.summary     = 'Ruby runtime for the @barefootjs/erb adapter'
  s.description = 'Engine-agnostic BarefootJS server runtime targeting ERB, ' \
                  'ported from packages/adapter-perl/lib/BarefootJS.pm.'
  s.authors     = ['kobaken']
  s.email       = ['kentafly88@gmail.com']
  s.homepage    = 'https://github.com/piconic-ai/barefootjs'
  s.license     = 'MIT'

  s.required_ruby_version = '>= 3.1'

  s.files = Dir['lib/**/*.rb']

  s.metadata['source_code_uri'] = 'https://github.com/piconic-ai/barefootjs/tree/main/packages/adapter-erb'
  s.metadata['rubygems_mfa_required'] = 'true'
end
