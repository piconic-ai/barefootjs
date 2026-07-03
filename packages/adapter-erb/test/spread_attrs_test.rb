# frozen_string_literal: true

require 'minitest/autorun'
require 'barefoot_js'

# spread_attrs -- JSX intrinsic-element spread runtime helper (#1407
# follow-up). Mirrors the JS `spreadAttrs` in
# packages/client/src/runtime/spread-attrs.ts and the Go/Perl adapters'
# spread helpers so SSR output stays byte-equal across adapters.
# Ruby port of packages/adapter-perl/t/spread_attrs.t.
class SpreadAttrsPureBackend
  def mark_raw(str)
    str
  end
end

class SpreadAttrsTest < Minitest::Test
  def setup
    @bf = BarefootJS::Context.new(SpreadAttrsPureBackend.new)
  end

  def spread(bag)
    @bf.spread_attrs(bag)
  end

  def test_basic_shapes
    assert_equal '', spread(nil)
    assert_equal '', spread({})
    assert_equal '', spread('not a hash')
    assert_equal 'id="a"', spread({ id: 'a' })
  end

  def test_alphabetic_key_order_deterministic_ssr
    assert_equal 'class="on" id="a"', spread({ id: 'a', class: 'on' })
  end

  def test_key_remapping
    assert_equal 'class="foo"', spread({ className: 'foo' })
    assert_equal 'for="x"', spread({ htmlFor: 'x' })
    assert_equal 'data-priority="high"', spread({ dataPriority: 'high' })
    # SVG XML attrs are case-sensitive -- preserve verbatim.
    assert_equal 'viewBox="0 0 10 10"', spread({ viewBox: '0 0 10 10' })
    assert_equal 'clipPathUnits="userSpaceOnUse"', spread({ clipPathUnits: 'userSpaceOnUse' })
    # JS-reference parity (#1411): a leading uppercase letter emits a
    # leading dash. The resulting HTML attribute name is invalid in every
    # runtime, but the byte-equal output across adapters matters more.
    assert_equal '-x-data="x"', spread({ XData: 'x' })
  end

  def test_event_handlers_js_predicate_parity
    # JS: `key.startsWith('on') && key.length > 2 && key[2] === key[2].toUpperCase()`.
    assert_equal 'id="a"', spread({ onClick: 'fn', id: 'a' })
    assert_equal 'id="a"', spread({ on_custom: 'fn', id: 'a' })
    assert_equal 'id="a"', spread({ on0: 'fn', id: 'a' })
    assert_equal 'oncology="x"', spread({ oncology: 'x' })
  end

  def test_children_skipped_ref_passed_through_js_reference_parity
    assert_equal 'id="a"', spread({ children: 'x', id: 'a' })
    # JS `spreadAttrs` does NOT filter `ref` (`applyRestAttrs` does --
    # that's a separate divergence). Match the JS reference so SSR stays
    # byte-equal with Hono / Go.
    assert_equal 'id="a" ref="x"', spread({ ref: 'x', id: 'a' })
  end

  def test_boolean_values_are_real_ruby_booleans
    # The contract: Ruby's real true/false ARE JS booleans -- no sentinel
    # detection needed (unlike the Perl/Go ports, which must recognise a
    # JSON::PP::Boolean / marshalled-bool wrapper). Plain 0/1 render as
    # numeric values, distinguishable for free since they're a different
    # Ruby class.
    assert_equal 'hidden id="a"', spread({ hidden: true, id: 'a' })
    assert_equal 'id="a"', spread({ hidden: false, id: 'a' })
    # Plain numeric 0 renders as a value (matches HTML `tabindex="0"`).
    assert_equal 'tabindex="0"', spread({ tabindex: 0 })
  end

  def test_nullish_skip
    assert_equal 'b="x"', spread({ a: nil, b: 'x' })
  end

  def test_html_escape
    assert_equal 'title="&lt;b&gt;&#34;x&#34;&lt;/b&gt;"', spread({ title: '<b>"x"</b>' })
    assert_equal 'alt="tom &amp; jerry"', spread({ alt: 'tom & jerry' })
  end

  def test_style_object_lowering
    assert_equal 'style="background-color:red;color:white"',
                 spread({ style: { backgroundColor: 'red', color: 'white' } })
    assert_equal 'style="color:red"', spread({ style: 'color:red' })
  end
end
