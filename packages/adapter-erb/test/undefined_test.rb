# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'tmpdir'
require 'barefoot_js'
require 'barefoot_js/backend/erb'

# JS `undefined` as a value (spec/js-undefined-value.md, rollout step U4).
# `BarefootJS::UNDEF` is the runtime's undefined; host `nil` is JS `null`.
# These pin the parts the golden vectors do not reach: Ruby's own view of
# `UNDEF` (truthy, `nil?`, `&.`), a template's spellings, the JSON walk the
# `bf-p` writer shares with `bf.json`, the helpers' optional-argument
# defaults and the root seed.
class UndefinedTest < Minitest::Test
  U = BarefootJS::UNDEF

  def setup
    @dir = Dir.mktmpdir
    @backend = BarefootJS::Backend::Erb.new(path: @dir, cache: false)
    @bf = BarefootJS::Context.new(@backend)
  end

  def teardown
    FileUtils.remove_entry(@dir)
  end

  def render(src, vars = {})
    File.write(File.join(@dir, 't.erb'), src)
    @backend.render_named('t', @bf, vars)
  end

  def test_one_frozen_singleton
    assert U.frozen?
    assert_same U, @bf.undefined
    assert_same U, U.dup
    assert_same U, U.clone
    assert_raises(NoMethodError) { BarefootJS::Undefined.new }
  end

  def test_predicates
    assert BarefootJS.undefined?(U)
    refute BarefootJS.undefined?(nil)
    assert BarefootJS.null?(nil)
    refute BarefootJS.null?(U)
    [nil, U].each { |v| assert BarefootJS.nullish?(v) }
    [0, '', false, [], {}].each { |v| refute BarefootJS.nullish?(v) }
    assert @bf.is_undefined(U)
    assert @bf.is_null(nil)
    assert @bf.is_nullish(U)
  end

  # Ruby cannot make `UNDEF` falsy: its own `if` / `||` see it as truthy,
  # which is why every JS test in a template is `bf.truthy?`.
  def test_ruby_s_own_view
    assert U.nil?
    refute U == nil
    assert_equal 'yes', (U ? 'yes' : 'no')
    refute @bf.truthy?(U)
    assert_equal '', U.to_s
    assert_equal 'undefined', U.inspect
    assert_same U, U[:a]
    assert_same U, U&.[](:a)
    assert_equal '[null]', JSON.generate([U])
  end

  def test_a_template_var_the_host_did_not_set_is_undefined
    out = render('<%= bf.is_undefined(v[:x]) %>|<%= bf.is_null(v[:x]) %>|<%= bf.is_nullish(v[:x]) %>')
    assert_equal 'true|false|true', out
    assert_equal 'false|true', render('<%= bf.is_undefined(v[:x]) %>|<%= bf.is_null(v[:x]) %>', { x: nil })
    # The host's own Hash keeps its default.
    vars = { a: 1 }
    render('<%= v[:b] %>', vars)
    assert_nil vars[:b]
  end

  def test_a_template_prints_undefined_as_empty
    assert_equal '[]', render('[<%= bf.h(v[:u]) %>]', { u: U })
    assert_equal '[]', render('[<%= bf.h(bf.json(v[:u])) %>]', { u: U })
  end

  def test_keep_nonnil_coalesces_both_nils
    assert_nil @bf.keep_nonnil(U)
    assert_nil @bf.keep_nonnil(nil)
    assert_equal [0], @bf.keep_nonnil(0)
  end

  def test_json_follows_json_stringify
    assert_equal '{"a":null}', @bf.json({ a: nil, b: U })
    assert_equal '[null,null,1]', @bf.json([U, nil, 1])
    assert_equal '{"o":{}}', @bf.json({ o: { b: U } })
    assert_same U, @bf.json(U)
  end

  def test_bf_p_drops_an_undefined_prop
    @bf._props({ a: nil, b: U, c: [U] })
    attr = @bf.props_attr
    payload = JSON.parse(attr[" bf-p='".length..-2].gsub('&#34;', '"'))
    assert_equal({ 'a' => nil, 'c' => [nil] }, payload)
    @bf._scope_id('s')
    assert_equal '<!--bf-scope:s|{"a":null,"c":[null]}-->', @bf.scope_comment
  end

  def test_coercions_tell_the_nils_apart
    assert_equal 'undefined', @bf.to_string(U)
    assert_equal 'null', @bf.to_string(nil)
    assert_equal 'undefinedx', @bf.plus(U, 'x')
    assert @bf.to_number(U).nan?
    assert_equal 0, @bf.to_number(nil)
    assert_equal(-1, @bf.sub(nil, 1))
    assert @bf.mul(U, 2).nan?
    refute @bf.strict_eq(U, nil)
    assert @bf.strict_eq(U, U)
    assert @bf.floor(U).nan?
    assert_equal 0, @bf.floor(nil)
    # The display helpers render both nils as "" / NaN.
    assert_equal '', @bf.string(U)
    assert_equal '', @bf.string(nil)
    assert @bf.number(U).nan?
  end

  def test_reads_that_miss_are_undefined
    assert_same U, @bf.get({ a: 1 }, :b)
    assert_same U, @bf.get([1], 5)
    assert_same U, @bf.get(nil, :a)
    assert_same U, @bf.at([1], 5)
    assert_same U, @bf.at('a', 5)
    assert_same U, @bf.find([1], ->(_) { false })
    assert_same U, @bf.find_last([1], ->(_) { false })
    assert_same U, @bf.length({})
    assert_nil @bf.get({ a: nil }, :a)
    assert_same U, @bf.flat_map([{}], 'field', 'a').first
  end

  def test_get_opt_is_optional_chaining
    assert_same U, @bf.get_opt(nil, :a)
    assert_same U, @bf.get_opt(U, :a)
    assert_same U, @bf.get_opt({}, :a)
    assert_nil @bf.get_opt({ a: nil }, :a)
    assert_equal 1, @bf.get_opt({ a: 1 }, :a)
  end

  def test_array_search_uses_strict_equality
    assert @bf.includes([U], U)
    refute @bf.includes([nil], U)
    refute @bf.includes([U], nil)
    assert_equal 1, @bf.index_of([nil, U], U)
    assert_equal 1, @bf.index_of([U, nil], nil)
    # A string receiver ToString's its needle.
    assert @bf.includes('aundefinedb', U)
    assert @bf.includes('anullb', nil)
    refute @bf.includes('ab', nil)
  end

  def test_join_prints_both_nils_empty
    assert_equal ',,1', @bf.join([nil, U, 1])
    assert_equal '1,2', @bf.join([1, 2], U)
    assert_equal '1null2', @bf.join([1, 2], nil)
  end

  def test_sort_puts_undefined_last
    keys = { keys: [{ key_kind: 'self', compare_type: 'numeric', direction: 'asc' }] }
    assert_equal [nil, 1, 2, 3, U], @bf.sort([3, U, 1, nil, 2], keys)
    cmp = JSON.generate({ kind: 'binary', op: '-', left: { kind: 'identifier', name: 'a' }, right: { kind: 'identifier', name: 'b' } })
    assert_equal [nil, 1, 2, 3, U], @bf.sort_eval([3, U, 1, nil, 2], cmp, 'a', 'b')
  end

  def test_optional_argument_defaults_apply_to_undefined_only
    assert_equal [2, 3], @bf.slice([1, 2, 3], 1)
    assert_equal [2, 3], @bf.slice([1, 2, 3], 1, U)
    assert_equal [], @bf.slice([1, 2, 3], 1, nil)
    assert_equal '  abc', @bf.pad_start('abc', 5, U)
    assert_equal 'nuabc', @bf.pad_start('abc', 5, nil)
    assert_equal ['a,b'], @bf.split('a,b', U)
    assert_equal %w[a b], @bf.split('anullb', nil)
    assert_equal [], @bf.split('a,b', ',', nil)
    assert_equal %w[a b], @bf.split('a,b', ',', U)
    assert @bf.ends_with('abc', 'c', U)
    assert @bf.ends_with('abc', '', nil)
    refute @bf.ends_with('abc', 'c', nil)
    assert_equal 7, @bf.at([7, 8], U)
    assert_equal 7, @bf.at([7, 8], nil)
    assert_equal '1', @bf.to_fixed(1.25, U)
    assert_equal [1, 2], @bf.flat_dynamic([[1, 2]], U)
    assert_equal [[1, 2]], @bf.flat_dynamic([[1, 2]], nil)
  end

  def test_search_params_get_of_an_absent_key_stays_null
    assert BarefootJS.null?(@bf.search_params('a=1').get('b'))
  end

  # A present prop keeps its value, `nil` included; an absent or `UNDEF` one
  # takes its default, or `UNDEF` without one (decision 6).
  def test_the_seed
    defaults = { a: { propName: 'a', value: 'D' }, b: { propName: 'b' } }
    seed = ->(props) { BarefootJS::Context.derive_vars_from_defaults(defaults, props) }
    assert_equal 'D', seed.call({})[:a]
    assert_equal 'D', seed.call({ a: U })[:a]
    assert_nil seed.call({ a: nil })[:a]
    assert_same U, seed.call({})[:b]
    assert_nil seed.call({ b: nil })[:b]
  end

  def test_passed_counts_a_present_nil
    @bf._props({ a: nil, b: U })
    assert @bf.passed?(:a, false)
    assert @bf.passed?(:b, false)
    refute @bf.passed?(:c, true)
  end

  def test_evaluator_reads
    ev = BarefootJS::Evaluator
    ident = { kind: 'identifier', name: 'undefined' }
    assert_same U, ev.evaluate(ident, {})
    assert_raises(ev::EvalUnsupported) { ev.evaluate({ kind: 'identifier', name: 'x' }, {}) }
    missing = { kind: 'member', object: { kind: 'identifier', name: 'o' }, property: 'x', computed: false }
    assert_same U, ev.evaluate(missing, { o: {} })
    coalesce = { kind: 'logical', op: '??', left: missing, right: { kind: 'literal', value: 'd', literalType: 'string' } }
    assert_equal 'd', ev.evaluate(coalesce, { o: {} })
    assert_equal 'd', ev.evaluate(coalesce, { o: { x: nil } })
  end

  def test_string_and_number_with_no_argument
    call = lambda do |name, args|
      BarefootJS::Evaluator.evaluate({ kind: 'call', callee: { kind: 'identifier', name: name }, args: args }, {})
    end
    undef_arg = [{ kind: 'identifier', name: 'undefined' }]
    assert_equal 0, call.call('Number', [])
    assert_equal '', call.call('String', [])
    assert call.call('Number', undef_arg).nan?
    assert_equal 'undefined', call.call('String', undef_arg)
  end
end
