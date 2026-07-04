# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'barefoot_js/evaluator'

# Hand-built ParsedExpr node constructors for the fold / sort_by trees,
# mirroring the Perl evaluator.t / Go eval_test.go demonstrations so every
# backend proves the SAME restriction-lifting on the SAME shapes. Ruby port
# of packages/adapter-perl/t/evaluator.t.
Ev = BarefootJS::Evaluator

def nid(name)
  { kind: 'identifier', name: name }
end

def nmem(obj, prop)
  { kind: 'member', object: obj, property: prop, computed: false }
end

def nbin(op, left, right)
  { kind: 'binary', op: op, left: left, right: right }
end

def nstr(v)
  { kind: 'literal', value: v, literalType: 'string' }
end

def nnum(v)
  { kind: 'literal', value: v, literalType: 'number' }
end

def ncall_math(fn, arg)
  { kind: 'call', callee: nmem(nid('Math'), fn), args: [arg] }
end

class EvaluatorTest < Minitest::Test
  # fold lifts bf.reduce's op restriction and acc-canonical form: a reducer
  # body that mixes acc with a product of two fields is impossible in the
  # +/* self/field catalogue but trivial for the evaluator.
  def test_fold_arbitrary_reducer_body
    body = nbin('+', nid('acc'), nbin('*', nmem(nid('item'), 'price'), nmem(nid('item'), 'qty')))
    items = [{ price: 5, qty: 3 }, { price: 2, qty: 4 }]
    assert_equal 23, Ev.fold(items, body, 'acc', 'item', 0, 'left')
  end

  # reduceRight is observable for string concatenation; the same body folds
  # both directions.
  def test_fold_direction_observable_for_string_concat
    body = nbin('+', nid('acc'), nid('item'))
    items = %w[a b c]
    assert_equal 'abc', Ev.fold(items, body, 'acc', 'item', '', 'left')
    assert_equal 'cba', Ev.fold(items, body, 'acc', 'item', '', 'right')
  end

  # sort_by lifts bf.sort's comparator-pattern restriction: a comparator
  # that calls Math.abs on each operand's field is outside the
  # subtraction / localeCompare / relational-ternary catalogue, but is
  # just another pure expression to the evaluator.
  def test_sort_by_arbitrary_comparator_body
    cmp = nbin('-', ncall_math('abs', nmem(nid('a'), 'v')), ncall_math('abs', nmem(nid('b'), 'v')))
    items = [{ v: -5 }, { v: 3 }, { v: -1 }]
    sorted = Ev.sort_by(items, cmp, 'a', 'b')
    assert_equal [-1, 3, -5], sorted.map { |i| i[:v] }
  end

  # Descending is just a reversed comparator body -- no separate direction
  # knob.
  def test_sort_by_descending_via_reversed_comparator
    cmp = nbin('-', nmem(nid('b'), 'x'), nmem(nid('a'), 'x'))
    items = [{ x: 10 }, { x: 30 }, { x: 20 }]
    sorted = Ev.sort_by(items, cmp, 'a', 'b')
    assert_equal [30, 20, 10], sorted.map { |i| i[:x] }
  end

  # Non-finite coercion stays JS-faithful (and matches the Go/Perl
  # evaluators): division by zero is +-Infinity / NaN rather than raising,
  # and those values stringify as "Infinity" / "-Infinity" / "NaN".
  def test_non_finite_division_by_zero_and_js_stringification
    div = lambda do |a, b|
      Ev.evaluate(nbin('/', nid('a'), nid('b')), { a: a, b: b })
    end
    assert_equal Float::INFINITY, div.call(1, 0)
    assert_equal(-Float::INFINITY, div.call(-1, 0))
    nan = div.call(0, 0)
    assert nan.nan?, '0/0 is NaN'

    assert_equal 'Infinity', Ev.to_string(Float::INFINITY)
    assert_equal '-Infinity', Ev.to_string(-Float::INFINITY)
    assert_equal 'NaN', Ev.to_string(Float::NAN)
  end

  # Captured free vars flow through base_env -- a reducer / comparator body
  # can reference an outer const.
  def test_captured_free_vars_via_base_env
    body = nbin('+', nid('acc'), nbin('*', nid('item'), nid('factor')))
    sum = Ev.fold([1, 2, 3], body, 'acc', 'item', 0, 'left', { factor: 10 })
    assert_equal 60, sum

    cmp = nbin('-',
                ncall_math('abs', nbin('-', nid('a'), nid('pivot'))),
                ncall_math('abs', nbin('-', nid('b'), nid('pivot'))))
    sorted = Ev.sort_by([1, 8, 4], cmp, 'a', 'b', { pivot: 5 })
    assert_equal [4, 8, 1], sorted
  end

  # Boolean-valued operators return real Ruby booleans (not 0/1) --
  # matching the Go/Perl evaluators (Perl needs an explicit JSON::PP
  # sentinel wrap; Ruby's own `<`/`===`/`!` already yield true/false).
  def test_boolean_valued_ops_return_real_booleans
    lt = Ev.evaluate(nbin('<', nid('a'), nid('b')), { a: 1, b: 2 })
    assert [true, false].include?(lt), 'a < b is a real boolean'
    assert_equal 'true', Ev.to_string(lt)

    cat = Ev.evaluate(nbin('+', nstr('x'), nbin('<', nid('a'), nid('b'))), { a: 1, b: 2 })
    assert_equal 'xtrue', cat

    eq = Ev.evaluate(nbin('===', nid('a'), nid('b')), { a: 1, b: 1 })
    assert_equal true, eq

    not_result = Ev.evaluate({ kind: 'unary', op: '!', argument: nstr('') }, {})
    assert_equal 'true', Ev.to_string(not_result)

    bool_call = Ev.evaluate({ kind: 'call', callee: nid('Boolean'), args: [nstr('')] }, {})
    assert_equal false, bool_call
    assert_equal 'false', Ev.to_string(bool_call)

    # `.length` is a string/array property only; a numeric scalar has none.
    assert_raises(Ev::EvalUnsupported) { Ev.evaluate(nmem(nid('n'), 'length'), { n: 123 }) }
  end

  # sort_by tolerates a non-array receiver by returning an empty Array (the
  # BarefootJS::Context#sort convention), never nil.
  def test_sort_by_non_array_receiver_returns_empty_array
    cmp = nbin('-', nid('a'), nid('b'))
    assert_equal [], Ev.sort_by(nil, cmp, 'a', 'b')
    assert_equal [], Ev.sort_by(42, cmp, 'a', 'b')
  end

  # sort_by is stable: equal-comparing elements keep their input order. The
  # explicit index tie-break makes this independent of Ruby's sort
  # implementation, matching Go's sort.SliceStable.
  def test_sort_by_is_stable_for_equal_keys
    cmp = nbin('-', nmem(nid('a'), 'k'), nmem(nid('b'), 'k'))
    equal_keys = Ev.sort_by(
      [{ k: 1, id: 'a' }, { k: 1, id: 'b' }, { k: 1, id: 'c' }], cmp, 'a', 'b'
    )
    assert_equal %w[a b c], equal_keys.map { |i| i[:id] }

    mixed = Ev.sort_by(
      [{ k: 2, id: 'x' }, { k: 1, id: 'y' }, { k: 2, id: 'z' }], cmp, 'a', 'b'
    )
    assert_equal %w[y x z], mixed.map { |i| i[:id] }
  end

  # fold_json / sort_by_json are the JSON-string seam the adapters emit
  # into: the serialized ParsedExpr body travels as a `bf.reduce_eval` /
  # `bf.sort_eval` argument and is decoded here, then handed to fold /
  # sort_by.
  def test_fold_json_and_sort_by_json_decode_and_evaluate
    rows = [{ duration: 95 }, { duration: 213 }, { duration: 185 }]

    reduce_json = JSON.generate(nbin('+', nid('sum'), nmem(nid('t'), 'duration')))
    assert_equal 493, Ev.fold_json(rows, reduce_json, 'sum', 't', 0, 'left', {})

    labels = [{ label: 'a' }, { label: 'b' }, { label: 'c' }]
    concat_json = JSON.generate(nbin('+', nid('acc'), nmem(nid('x'), 'label')))
    assert_equal 'abc', Ev.fold_json(labels, concat_json, 'acc', 'x', '', 'left', {})
    assert_equal 'cba', Ev.fold_json(labels, concat_json, 'acc', 'x', '', 'right', {})

    cmp_json = JSON.generate(nbin('-', nmem(nid('a'), 'duration'), nmem(nid('b'), 'duration')))
    sorted = Ev.sort_by_json(rows, cmp_json, 'a', 'b', {})
    assert_equal [95, 185, 213], sorted.map { |r| r[:duration] }
  end

  # The higher-order predicate helpers evaluate an arbitrary pure predicate
  # body per element, generalizing filter/find/every/some.
  def test_filter_every_some_find_find_index_over_a_predicate_body
    rows = [{ age: 15 }, { age: 30 }, { age: 18 }]
    pred = nbin('>=', nmem(nid('u'), 'age'), nnum(18))

    f = Ev.filter(rows, pred, 'u')
    assert_equal [30, 18], f.map { |r| r[:age] }

    assert_equal true, Ev.some(rows, pred, 'u')
    assert_equal false, Ev.every(rows, pred, 'u')

    assert_equal 30, Ev.find(rows, pred, 'u', true)[:age]
    assert_equal 18, Ev.find(rows, pred, 'u', false)[:age]
    assert_equal 1, Ev.find_index(rows, pred, 'u', true)
    assert_equal 2, Ev.find_index(rows, pred, 'u', false)

    assert_equal true, Ev.every([], pred, 'u')
    assert_equal false, Ev.some([], pred, 'u')
    assert_nil Ev.find([], pred, 'u')
    assert_equal(-1, Ev.find_index([], pred, 'u'))

    json = JSON.generate(pred)
    fj = Ev.filter_json(rows, json, 'u')
    assert_equal [30, 18], fj.map { |r| r[:age] }
    assert_equal false, Ev.every_json(rows, json, 'u')
    assert_equal true, Ev.some_json(rows, json, 'u')
    assert_equal 30, Ev.find_json(rows, json, 'u', true)[:age]
    assert_equal 2, Ev.find_index_json(rows, json, 'u', false)

    cap = nbin('>=', nmem(nid('u'), 'age'), nid('threshold'))
    hi = Ev.filter(rows, cap, 'u', { threshold: 18 })
    lo = Ev.filter(rows, cap, 'u', { threshold: 100 })
    assert_equal 2, hi.length
    assert_equal 0, lo.length
    assert_equal(-1, Ev.find_index(rows, cap, 'u', true, { threshold: 100 }))
  end

  # flat_map projects each element through a projection body and flattens
  # one level -- a field projection yielding an array contributes its
  # elements; an array-literal (tuple) projection contributes its leaves.
  def test_flat_map_projects_and_flattens_one_level
    rows = [{ tags: %w[a b] }, { tags: ['c'] }]
    field = nmem(nid('i'), 'tags')
    assert_equal %w[a b c], Ev.flat_map(rows, field, 'i')

    pts = [{ x: 1, y: 2 }, { x: 3, y: 4 }]
    tuple = { kind: 'array-literal', elements: [nmem(nid('p'), 'x'), nmem(nid('p'), 'y')] }
    assert_equal [1, 2, 3, 4], Ev.flat_map(pts, tuple, 'p')

    fj = Ev.flat_map_json(rows, JSON.generate(field), 'i')
    assert_equal %w[a b c], fj
  end

  # map_items is the value-producing `.map(cb)` -- one result per element,
  # NO flatten (an array-valued projection stays one element).
  def test_map_items_projects_one_result_per_element_no_flatten
    tmpl = {
      kind: 'template-literal',
      parts: [
        { type: 'string', value: '#' },
        { type: 'expression', expr: nid('t') },
      ],
    }
    assert_equal %w[#perl #go], Ev.map_items(%w[perl go], tmpl, 't')

    users = [{ name: 'Ada' }, { name: 'Grace' }]
    field = nmem(nid('u'), 'name')
    assert_equal %w[Ada Grace], Ev.map_items(users, field, 'u')

    rows = [{ tags: %w[a b] }]
    assert_equal [%w[a b]], Ev.map_items(rows, nmem(nid('i'), 'tags'), 'i')

    mj = Ev.map_json(users, JSON.generate(field), 'u')
    assert_equal %w[Ada Grace], mj
  end

  # #2094: a callback body can itself contain a nested `.map`/`.filter` --
  # e.g. the `.flatMap(p => p.tags.map(t => '#' + t))` blog-showcase shape
  # (#1938). The nested call is a `call` node whose callee is
  # `{kind: 'member', object, property: 'map'|'filter', computed: false}`
  # and whose first arg is an `arrow` node -- recognized BEFORE the
  # builtin-callee check, mirroring Go's `evalArrayCallbackCall`.
  def narrow(params, body)
    { kind: 'arrow', params: params, body: body }
  end

  def ncall_method(object, prop, args)
    { kind: 'call', callee: nmem(object, prop), args: args }
  end

  def test_nested_map_string_prefix_projection
    body = ncall_method(nmem(nid('item'), 'tags'), 'map', [narrow(['t'], nbin('+', nstr('#'), nid('t')))])
    env = { item: { tags: %w[go perl] } }
    assert_equal %w[#go #perl], Ev.evaluate(body, env)
  end

  def test_nested_map_two_param_arrow_value_and_index
    body = ncall_method(
      nid('arr'), 'map',
      [narrow(%w[v i], nbin('+', nid('v'), nid('i')))],
    )
    assert_equal [10, 21, 32], Ev.evaluate(body, { arr: [10, 20, 30] })
  end

  def test_nested_filter_predicate_with_comparison
    body = ncall_method(
      nid('arr'), 'filter',
      [narrow(['x'], nbin('>', nid('x'), nnum(1)))],
    )
    assert_equal [2, 3], Ev.evaluate(body, { arr: [1, 2, 3] })
  end

  def test_nested_filter_composed_with_length
    # `arr.filter(x => x > 1).length > 0`
    filter_call = ncall_method(nid('arr'), 'filter', [narrow(['x'], nbin('>', nid('x'), nnum(1)))])
    body = nbin('>', nmem(filter_call, 'length'), nnum(0))
    assert_equal true, Ev.evaluate(body, { arr: [1, 2, 3] })
    assert_equal false, Ev.evaluate(body, { arr: [1] })
  end

  # #2094: `.join(sep?)` as a plain `array-method` node. Default separator
  # ",", and a `nil` element joins as "" (not the string "null").
  def test_array_method_join
    join_node = ->(object, args = []) { { kind: 'array-method', method: 'join', object: object, args: args } }
    assert_equal 'a,b,c', Ev.evaluate(join_node.call(nid('arr')), { arr: %w[a b c] })
    assert_equal 'a-b-c', Ev.evaluate(join_node.call(nid('arr'), [nstr('-')]), { arr: %w[a b c] })
    assert_equal '', Ev.evaluate(join_node.call(nid('arr')), { arr: [] })
    assert_equal 'a,,b', Ev.evaluate(join_node.call(nid('arr')), { arr: ['a', nil, 'b'] })
  end

  # Doubly-nested: `.flatMap(p => p.tags.map(t => '#'+t)).join(', ')` (the
  # #1938 blog-showcase shape) composes flat_map (the outer higher-order
  # fold) with a nested `.map` inside the projection body, then `.join` on
  # the flattened result.
  def test_doubly_nested_map_then_join
    proj = ncall_method(nmem(nid('p'), 'tags'), 'map', [narrow(['t'], nbin('+', nstr('#'), nid('t')))])
    posts = [{ tags: %w[go perl] }, { tags: ['rust'] }]
    flattened = Ev.flat_map(posts, proj, 'p')
    assert_equal %w[#go #perl #rust], flattened

    join_node = { kind: 'array-method', method: 'join', object: nid('flattened'), args: [nstr(', ')] }
    assert_equal '#go, #perl, #rust', Ev.evaluate(join_node, { flattened: flattened })
  end

  # `.length` on arrays AND strings resolves via a plain `member` read.
  def test_length_on_array_and_string
    assert_equal 3, Ev.evaluate(nmem(nid('arr'), 'length'), { arr: [1, 2, 3] })
    assert_equal 5, Ev.evaluate(nmem(nid('s'), 'length'), { s: 'hello' })
  end
end
