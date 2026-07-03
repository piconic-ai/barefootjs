# frozen_string_literal: true

require 'json'

module BarefootJS
  # Lightweight evaluator for the pure `ParsedExpr` subset, scoped to
  # higher-order callback bodies (reduce / sort / map / filter / find
  # `(...) => expr`) -- issue #2018. Templates cannot carry a lambda in
  # expression position, which is why the adapters historically special-cased
  # these callbacks into fixed shapes (bf.sort's comparator catalogue,
  # bf.reduce's +/* fold). Instead, the callback BODY rides as a pure
  # `ParsedExpr` subtree (the structured IR the compiler already produces) and
  # is evaluated here against an environment (`{acc, item, ...captured free
  # vars}`).
  #
  # Ruby port of BarefootJS::Evaluator (Perl), sharing the same contract as
  # the Go evaluator (bf.go). The accepted subset and its semantics are
  # documented in spec/compiler.md ("ParsedExpr Evaluator Semantics") and
  # pinned isomorphically by the cross-language golden vectors
  # (packages/adapter-tests/helper-vectors/eval-vectors.json). The literal
  # JS reference implementation is eval-reference.ts -- this port follows it
  # node-for-node, including its refusal behaviour (EvalUnsupported), which
  # is a closer contract match than the Perl port's silent-nil shortcuts
  # (Perl blurs strings/numbers and can't cheaply enforce every refusal;
  # Ruby's real type distinctions make strict refusal free).
  #
  # Value domain: JSON-shaped Ruby data with SYMBOL hash keys throughout
  # (object literals, environments, member/index results). AST nodes
  # (ParsedExpr, decoded from JSON) also use symbol keys -- `node[:kind]`,
  # `node[:left]`, etc. String KEYS from the AST that name environment
  # bindings or object fields (identifier names, `member.property`,
  # `object-literal` property keys) are plain Ruby Strings coming out of the
  # parser; they are converted to Symbols at the point they touch a
  # SYMBOL-keyed Hash (env or object value).
  module Evaluator
    # Thrown when a node/operator/builtin/identifier is outside the subset.
    class EvalUnsupported < StandardError; end

    module_function

    # evaluate(node, env) -> a Ruby value (Integer/Float, String, true/false,
    # nil, Array, Hash-with-symbol-keys) per the ParsedExpr AST node kind.
    def evaluate(node, env)
      return nil unless node.is_a?(Hash)
      kind = node[:kind]

      case kind
      when 'literal'
        node[:value]
      when 'identifier'
        name = node[:name]
        key = name.to_sym
        raise EvalUnsupported, "unbound identifier '#{name}'" unless env.key?(key)
        env[key]
      when 'binary'
        binary(node[:op], evaluate(node[:left], env), evaluate(node[:right], env))
      when 'unary'
        unary(node[:op], evaluate(node[:argument], env))
      when 'logical'
        op = node[:op]
        left = evaluate(node[:left], env)
        case op
        when '&&' then truthy?(left) ? evaluate(node[:right], env) : left
        when '||' then truthy?(left) ? left : evaluate(node[:right], env)
        else left.nil? ? evaluate(node[:right], env) : left # '??'
        end
      when 'conditional'
        truthy?(evaluate(node[:test], env)) ? evaluate(node[:consequent], env) : evaluate(node[:alternate], env)
      when 'member'
        read_property(evaluate(node[:object], env), node[:property])
      when 'index-access'
        read_index(evaluate(node[:object], env), evaluate(node[:index], env))
      when 'call'
        name = builtin_name(node[:callee])
        raise EvalUnsupported, 'only built-in calls (Math.*, String/Number/Boolean) are in the subset' if name.nil?
        args = (node[:args] || []).map { |a| evaluate(a, env) }
        call_builtin(name, args)
      when 'template-literal'
        out = +''
        (node[:parts] || []).each do |p|
          out << if p[:type] == 'string'
                   (p[:value] || '')
                 else
                   to_string(evaluate(p[:expr], env))
                 end
        end
        out
      when 'array-literal'
        (node[:elements] || []).map { |e| evaluate(e, env) }
      when 'object-literal'
        out = {}
        (node[:properties] || []).each { |prop| out[prop[:key].to_sym] = evaluate(prop[:value], env) }
        out
      when 'array-method'
        args = node[:args] || []
        if node[:method] == 'includes' && args.length == 1
          # `.includes(x)` (#2075) -- the one `array-method` in the
          # evaluator subset, shared between `Array.prototype.includes`
          # (SameValueZero membership) and `String.prototype.includes`
          # (substring search), matching the receiver-type dispatch the SSR
          # template lowering does at runtime (`bf.includes`). Mirrors the
          # JS reference's `includes()` (eval-reference.ts).
          includes_value(evaluate(node[:object], env), evaluate(args[0], env))
        else
          # Every other array/string method (`join`, `slice`, `flat`, ...)
          # is outside the subset; a callback body containing one is
          # refused upstream (BF101) and should never reach here, but the
          # evaluator refuses explicitly rather than falling through
          # silently, matching the JS reference.
          raise EvalUnsupported, "array-method '#{node[:method]}' is not in the evaluator subset"
        end
      else
        raise EvalUnsupported, "node kind '#{kind}' is not in the evaluator subset"
      end
    end

    # eval_json(json, env): decode a ParsedExpr JSON string and evaluate it.
    # `env` is a plain Ruby Hash with symbol keys (caller's responsibility,
    # matching the SYMBOL-keys-throughout value convention).
    def eval_json(json, env)
      evaluate(JSON.parse(json, symbolize_names: true), env)
    end

    # ---------------------------------------------------------------------
    # JS coercion primitives (ToNumber / ToString / ToBoolean).
    # ---------------------------------------------------------------------

    def to_number(v)
      return 0 if v.nil?
      return v ? 1 : 0 if v.is_a?(TrueClass) || v.is_a?(FalseClass)
      return v if v.is_a?(Numeric)
      if v.is_a?(String)
        t = v.strip
        return 0 if t.empty?
        return parse_numeric_string(t)
      end
      raise EvalUnsupported, "cannot coerce #{v.class} to number"
    end

    def to_string(v)
      return v if v.is_a?(String)
      return number_to_string(v) if v.is_a?(Numeric)
      return v ? 'true' : 'false' if v.is_a?(TrueClass) || v.is_a?(FalseClass)
      return 'null' if v.nil?
      raise EvalUnsupported, "cannot coerce #{v.class} to string"
    end

    def truthy?(v)
      return false if v.nil? || v.is_a?(FalseClass)
      return true if v.is_a?(TrueClass)
      if v.is_a?(Numeric)
        f = v.to_f
        return false if f.nan? || f.zero?
        return true
      end
      return v != '' if v.is_a?(String)
      true # arrays / objects are always truthy in JS
    end

    # ---------------------------------------------------------------------
    # Number <-> String helpers
    # ---------------------------------------------------------------------

    HEX_STRING_RE = /\A0[xX][0-9a-fA-F]+\z/
    NUMERIC_STRING_RE = /\A[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\z/

    def parse_numeric_string(t)
      return Float::INFINITY if t == 'Infinity' || t == '+Infinity'
      return -Float::INFINITY if t == '-Infinity'
      return Integer(t, 16) if t =~ HEX_STRING_RE
      return Float(t) if t =~ NUMERIC_STRING_RE

      Float::NAN
    end
    private_class_method :parse_numeric_string

    # JS Number#toString. Integral finite values (however they arrived --
    # Integer or an integral Float) render without a decimal point
    # ("1.0" -> "1"); non-finite values use the JS spellings ("NaN" /
    # "Infinity" / "-Infinity"), which Ruby's own Float#to_s does not use.
    # Non-integral floats fall back to Ruby's shortest-round-trip Float#to_s
    # (the same class of algorithm V8 uses), reformatted to JS's exponent
    # style. This is not the full ECMA-262 Number::toString grammar (no
    # attempt to match JS's exact exponential-notation thresholds), but it
    # is exact for every value the golden vectors exercise.
    def number_to_string(n)
      f = n.to_f
      return 'NaN' if f.nan?
      return f.negative? ? '-Infinity' : 'Infinity' if f.infinite?
      return '0' if f.zero?
      return n.to_i.to_s if f == f.to_i && f.abs < 1e21

      s = f.to_s
      if s.include?('e')
        mantissa, exp = s.split('e')
        mantissa = mantissa.sub(/\.0\z/, '')
        sign = exp.start_with?('-') ? '-' : '+'
        digits = exp.sub(/\A[+-]/, '').sub(/\A0+(?=\d)/, '')
        "#{mantissa}e#{sign}#{digits}"
      else
        s
      end
    end

    # ---------------------------------------------------------------------
    # Operators
    # ---------------------------------------------------------------------

    def binary(op, l, r)
      case op
      when '+'
        # JS `+`: string concatenation once either operand is a string,
        # numeric addition otherwise.
        return to_string(l) + to_string(r) if l.is_a?(String) || r.is_a?(String)

        to_number(l) + to_number(r)
      when '-' then to_number(l) - to_number(r)
      when '*' then to_number(l) * to_number(r)
      when '/'
        ln = to_number(l).to_f
        rn = to_number(r).to_f
        if rn.zero?
          # JS division by zero is finite-valued, not an error.
          if ln.zero? || ln.nan?
            Float::NAN
          else
            ln.positive? ? Float::INFINITY : -Float::INFINITY
          end
        else
          ln / rn
        end
      when '%'
        rn = to_number(r).to_f
        rn.zero? ? Float::NAN : to_number(l).to_f.remainder(rn)
      when '<', '<=', '>', '>=' then relational(op, l, r)
      when '===' then strict_eq(l, r)
      when '!==' then !strict_eq(l, r)
      else
        raise EvalUnsupported, "binary operator '#{op}' is not in the evaluator subset"
      end
    end
    private_class_method :binary

    def relational(op, l, r)
      # JS Abstract Relational Comparison: both strings -> compare by code
      # unit; otherwise coerce both to numbers (a NaN operand is false).
      c =
        if l.is_a?(String) && r.is_a?(String)
          l < r ? -1 : (l > r ? 1 : 0)
        else
          ln = to_number(l).to_f
          rn = to_number(r).to_f
          return false if ln.nan? || rn.nan?

          ln < rn ? -1 : (ln > rn ? 1 : 0)
        end
      case op
      when '<' then c < 0
      when '<=' then c <= 0
      when '>' then c > 0
      when '>=' then c >= 0
      else false
      end
    end
    private_class_method :relational

    def strict_eq(l, r)
      if non_primitive?(l) || non_primitive?(r)
        raise EvalUnsupported, '=== on a non-primitive is not in the evaluator subset'
      end
      return true if l.nil? && r.nil?
      return false if l.nil? || r.nil?
      return l == r if l.is_a?(Numeric) && r.is_a?(Numeric)
      return l == r if boolean?(l) && boolean?(r)
      return l == r if l.is_a?(String) && r.is_a?(String)

      false
    end
    private_class_method :strict_eq

    def non_primitive?(v)
      v.is_a?(Array) || v.is_a?(Hash)
    end
    private_class_method :non_primitive?

    # same_value_zero?(l, r): `Array.prototype.includes` membership test --
    # `===` except `NaN` equals itself (and +0/-0 are not distinguished,
    # which the JSON-decoded values here can't represent anyway). Reuses
    # `strict_eq`'s type/value rules for the primitive cases and only
    # special-cases the two-NaN case that `strict_eq` (deliberately, for
    # `===`) reports as unequal. Unlike `strict_eq`, never raises for a
    # non-primitive operand -- the JS reference's `sameValueZero` uses
    # native `===` directly (reference equality for objects/arrays, never a
    # throw), not the subset's throwing `strictEquals`; two freshly
    # JSON-decoded structures are never the same object, so this degrades to
    # `false` rather than raising. Public (unlike `strict_eq`) because
    # `BarefootJS::Context#includes` (barefoot_js.rb) calls it directly,
    # matching the Perl port's cross-module `_same_value_zero` use.
    def same_value_zero?(l, r)
      return true if l.is_a?(Numeric) && r.is_a?(Numeric) && l.to_f.nan? && r.to_f.nan?

      strict_eq(l, r)
    rescue EvalUnsupported
      false
    end

    # includes_value(obj, needle): the receiver-dispatch behind the
    # `array-method` `includes` node above, factored out so
    # `BarefootJS::Context#includes` (the runtime helper compiled templates
    # call directly, outside any evaluator subtree) can share it too --
    # mirrors `BarefootJS.pm::includes` delegating to
    # `BarefootJS::Evaluator::_same_value_zero`.
    def includes_value(obj, needle)
      return obj.any? { |el| same_value_zero?(el, needle) } if obj.is_a?(Array)
      return obj.include?(to_string(needle)) if obj.is_a?(String)

      # Any other receiver is not a JS `.includes` target -- degrade to
      # false rather than raising, mirroring the reference.
      false
    end

    def boolean?(v)
      v.is_a?(TrueClass) || v.is_a?(FalseClass)
    end
    private_class_method :boolean?

    def unary(op, v)
      case op
      when '!' then !truthy?(v)
      when '-' then -to_number(v)
      when '+' then to_number(v)
      else raise EvalUnsupported, "unary operator '#{op}' is not in the evaluator subset"
      end
    end
    private_class_method :unary

    # ---------------------------------------------------------------------
    # Built-in calls (the deterministic allowlist). Locale-sensitive
    # builtins (localeCompare) are deliberately excluded to keep the
    # backends isomorphic.
    # ---------------------------------------------------------------------

    def builtin_name(callee)
      return nil unless callee.is_a?(Hash)
      kind = callee[:kind]
      return callee[:name] if kind == 'identifier'
      if kind == 'member' && !callee[:computed]
        obj = callee[:object]
        return nil unless obj.is_a?(Hash) && obj[:kind] == 'identifier'

        return "#{obj[:name]}.#{callee[:property]}"
      end
      nil
    end
    private_class_method :builtin_name

    # Math.round rounds a half toward +Infinity (2.5 -> 3, -2.5 -> -2),
    # matching the shared `round` helper rather than half-away-from-zero.
    def math_round(n)
      return n if n.nan? || n.infinite?

      (n + 0.5).floor
    end
    private_class_method :math_round

    def call_builtin(name, args)
      case name
      when 'Math.max'
        return -Float::INFINITY if args.empty?

        nums = args.map { |a| to_number(a).to_f }
        return Float::NAN if nums.any?(&:nan?)

        nums.max
      when 'Math.min'
        return Float::INFINITY if args.empty?

        nums = args.map { |a| to_number(a).to_f }
        return Float::NAN if nums.any?(&:nan?)

        nums.min
      when 'Math.abs' then to_number(args[0]).abs
      when 'Math.floor'
        n = to_number(args[0]).to_f
        n.finite? ? n.floor : n
      when 'Math.ceil'
        n = to_number(args[0]).to_f
        n.finite? ? n.ceil : n
      when 'Math.round' then math_round(to_number(args[0]).to_f)
      when 'String' then to_string(args[0])
      when 'Number' then to_number(args[0])
      when 'Boolean' then truthy?(args[0])
      else
        raise EvalUnsupported, "builtin '#{name}' is not in the evaluator subset"
      end
    end
    private_class_method :call_builtin

    # ---------------------------------------------------------------------
    # Member / index access
    # ---------------------------------------------------------------------

    def read_property(obj, key)
      if obj.is_a?(String)
        return obj.length if key == 'length'

        raise EvalUnsupported, "property '#{key}' on a string is not in the evaluator subset"
      end
      if obj.is_a?(Array)
        return obj.length if key == 'length'

        raise EvalUnsupported, "property '#{key}' on an array is not in the evaluator subset"
      end
      if obj.is_a?(Hash)
        sym = key.to_sym
        return obj.key?(sym) ? obj[sym] : nil
      end
      raise EvalUnsupported, "cannot read property '#{key}' of #{obj.nil? ? 'null' : obj.class}"
    end
    private_class_method :read_property

    def read_index(obj, index)
      if obj.is_a?(Array)
        f = to_number(index).to_f
        return nil unless f.finite? && f == f.to_i

        i = f.to_i
        return nil if i.negative? || i >= obj.length

        obj[i]
      elsif obj.is_a?(Hash)
        read_property(obj, to_string(index))
      else
        raise EvalUnsupported, "cannot index #{obj.nil? ? 'null' : obj.class}"
      end
    end
    private_class_method :read_index

    # ---------------------------------------------------------------------
    # Evaluator-driven higher-order folds -- the runtime half `bf.rb` calls
    # into for sort_eval / reduce_eval / filter_eval / etc.
    # ---------------------------------------------------------------------

    # fold(items, body, acc_name, item_name, init, direction, base_env)
    #
    # Fold an array into a value via the evaluator. `body` is a pure
    # ParsedExpr node evaluated against `{acc_name => acc, item_name =>
    # item}` plus the captured free vars in `base_env`, per element.
    # `direction` is "left" (reduce) or "right" (reduceRight).
    def fold(items, body, acc_name, item_name, init, direction = 'left', base_env = nil)
      arr = items.is_a?(Array) ? items : []
      arr = arr.reverse if direction == 'right'
      env = base_env ? base_env.dup : {}
      acc = init
      acc_key = acc_name.to_sym
      item_key = item_name.to_sym
      arr.each do |item|
        env[acc_key] = acc
        env[item_key] = item
        acc = evaluate(body, env)
      end
      acc
    end

    def fold_json(items, body_json, acc_name, item_name, init, direction = 'left', base_env = nil)
      fold(items, JSON.parse(body_json, symbolize_names: true), acc_name, item_name, init, direction, base_env)
    end

    # sort_by(items, cmp, param_a, param_b, base_env)
    #
    # Return a new array ordered by a ParsedExpr comparator `cmp` evaluated
    # against `{param_a => a, param_b => b}` plus `base_env`. Stable
    # (ties break on original index) and non-mutating.
    def sort_by(items, cmp, param_a, param_b, base_env = nil)
      return [] unless items.is_a?(Array)

      env = base_env ? base_env.dup : {}
      a_key = param_a.to_sym
      b_key = param_b.to_sym
      decorated = items.each_with_index.map { |item, i| [i, item] }
      sorted = decorated.sort do |x, y|
        env[a_key] = x[1]
        env[b_key] = y[1]
        c = to_number(evaluate(cmp, env)).to_f
        sign = c.nan? ? 0 : (c <=> 0)
        sign.zero? ? (x[0] <=> y[0]) : sign
      end
      sorted.map { |pair| pair[1] }
    end

    def sort_by_json(items, cmp_json, param_a, param_b, base_env = nil)
      sort_by(items, JSON.parse(cmp_json, symbolize_names: true), param_a, param_b, base_env)
    end

    # ---------------------------------------------------------------------
    # Higher-order predicates -- the generalization of filter / find /
    # find_index / every / some onto the evaluator. `pred` is a pure
    # ParsedExpr evaluated against `{param => item}` plus `base_env`.
    # ---------------------------------------------------------------------

    def filter(items, pred, param, base_env = nil)
      return [] unless items.is_a?(Array)

      env = base_env ? base_env.dup : {}
      key = param.to_sym
      items.select do |item|
        env[key] = item
        truthy?(evaluate(pred, env))
      end
    end

    def every(items, pred, param, base_env = nil)
      arr = items.is_a?(Array) ? items : []
      env = base_env ? base_env.dup : {}
      key = param.to_sym
      arr.all? do |item|
        env[key] = item
        truthy?(evaluate(pred, env))
      end
    end

    def some(items, pred, param, base_env = nil)
      arr = items.is_a?(Array) ? items : []
      env = base_env ? base_env.dup : {}
      key = param.to_sym
      arr.any? do |item|
        env[key] = item
        truthy?(evaluate(pred, env))
      end
    end

    # find -- first matching element, or nil. `forward` false searches from
    # the end (findLast).
    def find(items, pred, param, forward = true, base_env = nil)
      arr = items.is_a?(Array) ? items : []
      arr = arr.reverse unless forward
      env = base_env ? base_env.dup : {}
      key = param.to_sym
      arr.each do |item|
        env[key] = item
        return item if truthy?(evaluate(pred, env))
      end
      nil
    end

    # find_index -- index of the first matching element, or -1. `forward`
    # false -> findLastIndex (the index is into the original array either
    # way).
    def find_index(items, pred, param, forward = true, base_env = nil)
      arr = items.is_a?(Array) ? items : []
      env = base_env ? base_env.dup : {}
      key = param.to_sym
      idxs = forward ? (0...arr.length) : (0...arr.length).to_a.reverse
      idxs.each do |i|
        env[key] = arr[i]
        return i if truthy?(evaluate(pred, env))
      end
      -1
    end

    # flat_map -- project each element through `proj` and flatten one level.
    # A projection yielding an array contributes its elements; any other
    # value contributes itself.
    def flat_map(items, proj, param, base_env = nil)
      arr = items.is_a?(Array) ? items : []
      env = base_env ? base_env.dup : {}
      key = param.to_sym
      out = []
      arr.each do |item|
        env[key] = item
        v = evaluate(proj, env)
        v.is_a?(Array) ? out.concat(v) : out.push(v)
      end
      out
    end

    # map_items -- project each element through `proj`, keeping each result
    # as one element (no flatten): value-producing `.map(cb)`. Named
    # `map_items` (not `map`) to stay clear of Ruby's own Enumerable#map.
    def map_items(items, proj, param, base_env = nil)
      arr = items.is_a?(Array) ? items : []
      env = base_env ? base_env.dup : {}
      key = param.to_sym
      arr.map do |item|
        env[key] = item
        evaluate(proj, env)
      end
    end

    def filter_json(items, pred_json, param, base_env = nil)
      filter(items, JSON.parse(pred_json, symbolize_names: true), param, base_env)
    end

    def every_json(items, pred_json, param, base_env = nil)
      every(items, JSON.parse(pred_json, symbolize_names: true), param, base_env)
    end

    def some_json(items, pred_json, param, base_env = nil)
      some(items, JSON.parse(pred_json, symbolize_names: true), param, base_env)
    end

    def find_json(items, pred_json, param, forward = true, base_env = nil)
      find(items, JSON.parse(pred_json, symbolize_names: true), param, forward, base_env)
    end

    def find_index_json(items, pred_json, param, forward = true, base_env = nil)
      find_index(items, JSON.parse(pred_json, symbolize_names: true), param, forward, base_env)
    end

    def flat_map_json(items, proj_json, param, base_env = nil)
      flat_map(items, JSON.parse(proj_json, symbolize_names: true), param, base_env)
    end

    def map_json(items, proj_json, param, base_env = nil)
      map_items(items, JSON.parse(proj_json, symbolize_names: true), param, base_env)
    end
  end
end
