<?php

declare(strict_types=1);

/**
 * JS `undefined` in the golden vectors (spec/js-undefined-value.md, "JSON
 * encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by
 * the primitive, helper and eval vector harnesses of both PHP adapters.
 *
 * - in `args` and the evaluator `env` the sentinel decodes to
 *   bf_vector_undefined_arg(), the runtime's `Barefoot\Undefined`;
 * - in an `expect` it matches only a value bf_is_runtime_undefined()
 *   accepts, the runtime's `Undefined`, also inside nested arrays and
 *   objects. A `null` expect matches PHP's `null` only.
 */

function bf_vector_undefined_arg()
{
    return \Barefoot\Undefined::value();
}

/** Whether `$got` is the runtime's own undefined value. */
function bf_is_runtime_undefined($got): bool
{
    return \Barefoot\Undefined::isUndefined($got);
}

/** Whether a JSON-decoded value (assoc array or stdClass) is `{"$undef": true}`. */
function bf_is_undef_sentinel($v): bool
{
    if ($v instanceof \stdClass) {
        $v = get_object_vars($v);
    }
    return is_array($v) && count($v) === 1 && array_key_exists('$undef', $v) && $v['$undef'] === true;
}

/** Replaces every `$undef` in an `args` / `env` value with bf_vector_undefined_arg(). */
function bf_undefined_to_arg($v)
{
    if (bf_is_undef_sentinel($v)) {
        return bf_vector_undefined_arg();
    }
    if (is_array($v)) {
        return array_map('bf_undefined_to_arg', $v);
    }
    if ($v instanceof \stdClass) {
        $out = new \stdClass();
        foreach (get_object_vars($v) as $k => $x) {
            $out->{$k} = bf_undefined_to_arg($x);
        }
        return $out;
    }
    return $v;
}
