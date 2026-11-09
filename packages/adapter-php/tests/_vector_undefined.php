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
    return \Barefoot\Undefined::isSentinel($v);
}

/** Replaces every `$undef` in an `args` / `env` value with bf_vector_undefined_arg(): the runtime's own manifest decoder. */
function bf_undefined_to_arg($v)
{
    return \Barefoot\Undefined::decode($v);
}
