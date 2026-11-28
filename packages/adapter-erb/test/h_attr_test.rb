# frozen_string_literal: true

require 'minitest/autorun'
require 'barefoot_js'

# `h` (element content) passes a `SafeString` capture through as markup;
# `h_attr` (an attribute value) escapes it like any other string, so the
# capture's own quotes cannot end the attribute value.
class HAttrStubBackend
  def mark_raw(str)
    BarefootJS::SafeString.new(str.to_s)
  end
end

class HAttrTest < Minitest::Test
  def setup
    @bf = BarefootJS::Context.new(HAttrStubBackend.new)
  end

  def test_h_passes_safe_string_through
    markup = BarefootJS::SafeString.new('<i class="label">hello</i>')
    assert_equal '<i class="label">hello</i>', @bf.h(markup)
  end

  def test_h_attr_escapes_safe_string
    markup = BarefootJS::SafeString.new('<i class="label">hello</i>')
    assert_equal '&lt;i class=&#34;label&#34;&gt;hello&lt;/i&gt;', @bf.h_attr(markup)
  end

  def test_h_attr_matches_h_for_plain_values
    ['a"b', 3, nil, true, [1, 2]].each do |value|
      assert_equal @bf.h(value), @bf.h_attr(value)
    end
  end
end
