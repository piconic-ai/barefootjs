# frozen_string_literal: true

module BarefootJS
  # Request-scoped SSR view of the query string behind the reactive
  # `searchParams()` environment signal (router v0.5, #1922). The framework
  # integration builds one per request from the request URL and threads it
  # into the template scope as `v[:searchParams]` (the camelCase JS name the
  # adapters keep, like every other signal/prop var); the compiled ERB
  # template reads it via `v[:searchParams].get('key')`.
  #
  # This runtime is template-engine- and framework-agnostic (Ruby stdlib
  # only), matching the rest of BarefootJS, so it can ship standalone.
  #
  # Semantics mirror the browser's URLSearchParams#get exactly under the
  # adapters' `?? -> ||=`-style lowering: get() returns the first value for a
  # key, or `nil` when the key is absent. A present-but-empty value
  # (`?sort=`) keeps the empty string -- the same distinction JS `??` draws
  # between `null` and `''`.
  class SearchParams
    # Parse a raw query string into the reader. A leading '?' is tolerated,
    # '+' decodes to a space, and %XX escapes are decoded -- mirroring
    # URLSearchParams's application/x-www-form-urlencoded parsing. A
    # malformed pair never raises; it simply contributes nothing, matching
    # the browser's lenient parsing.
    def initialize(query = '')
      query ||= ''
      query = query.sub(/\A\?/, '')
      @values = Hash.new { |h, k| h[k] = [] }
      query.split(/[&;]/).each do |pair|
        next if pair.empty?

        key, val = pair.split('=', 2)
        key = decode(key)
        val = val.nil? ? '' : decode(val)
        @values[key] << val
      end
    end

    # First value for `key`, or `nil` when the key is absent (see the class
    # docstring for why `nil` -- not '' -- is the right "missing" sentinel).
    # A present-but-empty value returns ''.
    def get(key)
      vals = @values[key]
      return nil if vals.nil? || vals.empty?

      vals.first
    end

    private

    def decode(s)
      s = (s || '').dup
      s.tr!('+', ' ')
      # %XX -> raw octet, then interpret the octet stream as UTF-8 (what
      # URLSearchParams does). A byte run that isn't valid UTF-8 is
      # replaced rather than raising (lenient parsing, mirrors the Perl
      # port's leave-as-is policy as closely as Ruby's String#encode allows).
      bytes = s.gsub(/%([0-9A-Fa-f]{2})/) { [Regexp.last_match(1)].pack('H2') }
      bytes.force_encoding('UTF-8')
      bytes.valid_encoding? ? bytes : bytes.force_encoding('ASCII-8BIT').encode('UTF-8', invalid: :replace, undef: :replace)
    end
  end
end
