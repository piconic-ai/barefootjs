# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'barefoot_js'

# props_attr -- the `bf-p` hydration-payload attribute. The encoded JSON is
# embedded in a SINGLE-quoted attribute, so it must be attribute-escaped: a
# raw `'` inside a string value (e.g. a blog paragraph) terminates the
# attribute early and the client hydrates from truncated JSON (empty island
# text; found via the shared blog-ssr e2e). Same fix across the Perl,
# Python, Ruby, and Rust runtimes -- keep the four tests in sync.
class PropsAttrStubBackend
  def encode_json(value)
    JSON.generate(value)
  end
end

class PropsAttrTest < Minitest::Test
  def bf_with(props)
    bf = BarefootJS::Context.new(PropsAttrStubBackend.new)
    bf._props(props)
    bf
  end

  def test_empty_props_emit_nothing
    assert_equal '', BarefootJS::Context.new(PropsAttrStubBackend.new).props_attr
    assert_equal '', bf_with({}).props_attr
  end

  def test_json_is_attribute_escaped
    attr = bf_with({ 'note' => "it's <b> & co" }).props_attr
    assert_equal " bf-p='{&#34;note&#34;:&#34;it&#39;s &lt;b&gt; &amp; co&#34;}'", attr
  end

  def test_attribute_round_trips_through_entity_decoding
    attr = bf_with({ 'note' => "it's <b> & co" }).props_attr
    value = attr[%r{bf-p='([^']*)'}, 1]
    decoded = value.gsub('&#34;', '"').gsub('&#39;', "'").gsub('&lt;', '<').gsub('&gt;', '>').gsub('&amp;', '&')
    assert_equal({ 'note' => "it's <b> & co" }, JSON.parse(decoded))
  end
end
