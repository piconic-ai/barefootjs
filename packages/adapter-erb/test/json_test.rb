# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'barefoot_js'

# bf.json -- JS `JSON.stringify`. JS writes -0 as `0` at any depth, where
# Ruby's encoder spells a Float zero `-0.0` / `0.0`.
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
end
