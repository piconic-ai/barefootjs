<?php

declare(strict_types=1);

/**
 * JS `undefined` in the golden vectors (spec/js-undefined-value.md, "JSON
 * encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by
 * the primitive, helper and eval vector harnesses of both PHP adapters.
 *
 * The PHP runtime has no undefined value yet (rollout step U6 adds it), so
 * for now:
 *
 * - in `args` and the evaluator `env` the sentinel decodes to
 *   bf_vector_undefined_arg(), the host nil (null) a template receives for
 *   `undefined` today;
 * - in an `expect` it matches only a value bf_is_runtime_undefined()
 *   accepts. None exists yet, so it never matches, also inside nested arrays
 *   and objects, and every such case is listed in an expected-failure ledger
 *   or pinned as a divergence.
 *
 * U6 flips both here: bf_vector_undefined_arg() returns the runtime's
 * undefined and bf_is_runtime_undefined() recognizes it.
 */

function bf_vector_undefined_arg()
{
    return null;
}

/** Whether `$got` is the runtime's own undefined value (none yet: U6). */
function bf_is_runtime_undefined($got): bool
{
    return false;
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
