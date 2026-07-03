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
end
