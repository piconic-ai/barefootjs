# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'barefoot_js'

# bf.json -- JS `JSON.stringify`. Numbers are written as JS writes them:
# -0 as `0`, an integral Float without `.0`, an unpadded exponent, and
# NaN / Infinity as `null`, at any depth -- where Ruby's encoder spells
# `-0.0`, `-2.0`, `-4.0e-08` and raises on a non-finite Float.
class BfJsonPureBackend
  def encode_json(data)
    JSON.generate(data)
  end

  def mark_raw(str)
    str
  end
end

class BfJsonTest < Minitest::Test
  def setup
    @bf = BarefootJS::Context.new(BfJsonPureBackend.new)
  end

  def test_negative_zero_remainder_is_zero
    assert_equal '0', @bf.json(@bf.mod(-4, 2))
    assert_equal '0', @bf.json(-0.0)
    assert_equal '0', @bf.json(0.0)
  end

  def test_negative_zero_is_zero_at_any_depth
    assert_equal '[0,1]', @bf.json([@bf.mod(-4, 2), 1])
    assert_equal '[[0],-1]', @bf.json([[-0.0], -1])
    assert_equal '{"a":0,"b":[0]}', @bf.json({ 'a' => -0.0, 'b' => [-0.0] })
  end

  def test_other_values_keep_their_spelling
    assert_equal '-0.5', @bf.json(-0.5)
    assert_equal '-1', @bf.json(@bf.mod(-3, 2))
    assert_equal '["-0",0]', @bf.json(['-0', 0])
  end

  def test_integral_floats_and_exponents_use_js_notation
    assert_equal '[-2,-0.5]', @bf.json([@bf.div(-4, 2), @bf.div(-4, 8)])
    assert_equal '[-4e-8,-400000000000000000000,-4e+21,-0.000001,-1e-7]',
                 @bf.json([-4e-8, -4e20, -4e21, -1e-6, -1e-7])
    assert_equal '[0.30000000000000004,1e+21]', @bf.json([0.1 + 0.2, 10**21])
    assert_equal '{"b":[-4e-8],"a":-2}', @bf.json({ 'b' => [-4e-8], a: -2.0 })
  end

  def test_non_finite_numbers_are_null_at_any_depth
    assert_equal 'null', @bf.json(@bf.div(-4, 0))
    assert_equal '[null,null,null,[null]]',
                 @bf.json([-Float::INFINITY, Float::INFINITY, Float::NAN, [-Float::INFINITY]])
    assert_equal '{"a":null}', @bf.json({ 'a' => Float::NAN })
  end

  def test_strings_booleans_and_nil_keep_their_spelling
    assert_equal '["-2.0","1e5",true,false,null]', @bf.json(['-2.0', '1e5', true, false, nil])
  end
end
