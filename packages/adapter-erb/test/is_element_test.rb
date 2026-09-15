# frozen_string_literal: true

require 'minitest/autorun'
require 'barefoot_js'

# bf.is_element -- the framework "is this a renderable element (not plain
# text)?" predicate `Slot`'s `asChild` pattern uses (#2266, #3012). Ported
# from the shared Perl runtime's `is_element` (packages/adapter-perl/lib/
# BarefootJS.pm), which the Mojolicious / Xslate adapters' own
# `isValidElement` primitives already call.
class BfIsElementPureBackend
  def mark_raw(str)
    str
  end
end

class BfIsElementTest < Minitest::Test
  def setup
    @bf = BarefootJS::Context.new(BfIsElementPureBackend.new)
  end

  def test_hash_with_tag_and_props_symbol_keys_is_an_element
    assert @bf.is_element({ tag: 'div', props: {} })
  end

  def test_hash_with_tag_and_props_string_keys_is_an_element
    assert @bf.is_element({ 'tag' => 'div', 'props' => {} })
  end

  def test_key_match_is_case_insensitive
    assert @bf.is_element({ Tag: 'div', Props: {} })
  end

  def test_hash_missing_props_is_not_an_element
    refute @bf.is_element({ tag: 'div' })
  end

  def test_hash_missing_tag_is_not_an_element
    refute @bf.is_element({ props: {} })
  end

  def test_plain_string_child_is_not_an_element
    # A passed-through JSX child is pre-rendered markup (a plain String) on
    # this SSR model -- a non-empty string must NOT read as an element, or
    # `Slot`'s `asChild` guard would wrongly take the element-merge branch.
    refute @bf.is_element('<span>hello</span>')
  end

  def test_nil_is_not_an_element
    refute @bf.is_element(nil)
  end

  def test_array_is_not_an_element
    refute @bf.is_element([1, 2, 3])
  end
end
