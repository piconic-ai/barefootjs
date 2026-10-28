# frozen_string_literal: true

require 'minitest/autorun'
require 'barefoot_js'

# render_child renderer-invocation contract (#1897): the renderer is
# invoked as `renderer.call(props_hash, invoking_bf)` so nested renders can
# chain scope/slot identity off the caller. Ruby port of
# packages/adapter-perl/t/render_child.t.
class RenderChildStubBackend
  def materialize(value)
    value.respond_to?(:call) ? value.call : value
  end
end

def new_bf
  BarefootJS::Context.new(RenderChildStubBackend.new)
end

class RenderChildTest < Minitest::Test
  def test_renderer_receives_the_invoking_instance
    bf = new_bf
    bf._scope_id('Root_test')

    seen_props = nil
    seen_caller = nil
    bf.register_child_renderer('probe', lambda { |props, caller|
      seen_props = props
      seen_caller = caller
      'ok'
    })

    assert_equal 'ok', bf.render_child('probe', { value: 1 })
    assert_equal 1, seen_props[:value]
    assert_same bf, seen_caller, 'second argument is the invoking instance'

    # A nested invocation from a different instance passes THAT instance.
    child = new_bf
    child._scope_id('Root_test_s0')
    child._child_renderers(bf._child_renderers)
    child.render_child('probe')
    assert_same child, seen_caller, 'nested call passes the nested instance'
  end

  def test_renderer_exceptions_propagate
    bf = new_bf
    bf.register_child_renderer('boom', ->(_props, _caller) { raise 'renderer exploded' })

    err = assert_raises(RuntimeError) { bf.render_child('boom') }
    assert_match(/renderer exploded/, err.message)
  end

  def test_unregistered_renderer_raises
    bf = new_bf
    err = assert_raises(RuntimeError) { bf.render_child('missing') }
    assert_match(/No renderer registered for child component 'missing'/, err.message)
  end

  def test_children_prop_is_materialized_through_the_backend
    bf = new_bf
    seen_children = nil
    bf.register_child_renderer('wrap', lambda { |props, _caller|
      seen_children = props[:children]
      ''
    })
    bf.render_child('wrap', { children: ->{ '<b>hi</b>' } })
    assert_equal '<b>hi</b>', seen_children
  end

  def test_childless_invocation_does_not_gain_a_spurious_children_key
    bf = new_bf
    seen_props = nil
    bf.register_child_renderer('probe', lambda { |props, _caller|
      seen_props = props
      ''
    })
    bf.render_child('probe', { value: 1 })
    refute seen_props.key?(:children)
  end

  # `passed?` answers from the keys the caller handed over, so a key passed
  # as nil counts and an omitted one does not; a root reads `_props`, and
  # with no record at all the template's own fallback decides.
  def test_passed_reads_the_caller_keys
    bf = new_bf
    seen = nil
    bf.register_child_renderer('probe', lambda { |_props, _caller|
      child = new_bf
      seen = [child.passed?(:label, false), child.passed?(:tone, true)]
      ''
    })
    bf.render_child('probe', { label: nil })
    assert_equal [true, false], seen

    root = new_bf
    assert_equal true, root.passed?(:label, true), 'no record: the fallback decides'
    assert_equal false, root.passed?(:label, false)
    root._props({ label: nil })
    assert_equal true, root.passed?(:label, false), 'a root reads its _props'
    assert_equal false, root.passed?(:tone, true)
  end

  def test_passed_reads_the_innermost_caller_after_a_nested_render
    bf = new_bf
    seen = []
    bf.register_child_renderer('leaf', ->(_props, _caller) { '' })
    bf.register_child_renderer('mid', lambda { |_props, caller|
      seen << caller.passed?(:label, false)
      caller.render_child('leaf', { tone: 'x' })
      seen << caller.passed?(:label, false)
      ''
    })
    bf.render_child('mid', { label: nil })
    assert_equal [true, true], seen
    assert_equal false, bf.passed?(:label, false), 'the record is gone once the render returns'
  end
end
