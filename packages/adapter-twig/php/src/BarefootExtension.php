<?php

declare(strict_types=1);

namespace Barefoot;

use Twig\Extension\AbstractExtension;
use Twig\TwigFilter;

/**
 * Twig filters the `@barefootjs/twig` adapter emits beside the `bf` runtime
 * object. `TwigBackend` adds this extension to the Environment it builds or
 * is given.
 *
 * `bf_js_or` / `bf_js_and` spell a value-position JS `l || r` / `l && r`
 * (#3824) as `(l)|bf_js_or((__bf_lazy) => r)`. Twig compiles its own `?:` and
 * `??` to PHP that repeats the left operand (`((test(l)) ? (l) : (r))`), so a
 * chain nested through them grows exponentially. A filter receives `l`
 * evaluated once and `r` as a closure it calls only when JS evaluates `r`
 * (the short circuit). They are filters, not `bf` methods, because Twig
 * accepts an arrow function as a filter argument since 3.x but as a method
 * argument only since 3.15, and `composer.json` allows `^3.10`. Twig has no
 * zero-parameter arrow, hence the unused `__bf_lazy`.
 */
final class BarefootExtension extends AbstractExtension
{
    /** @return list<TwigFilter> */
    public function getFilters(): array
    {
        return [
            new TwigFilter('bf_js_or', [self::class, 'jsOr']),
            new TwigFilter('bf_js_and', [self::class, 'jsAnd']),
        ];
    }

    public static function jsOr($left, callable $right): mixed
    {
        return Evaluator::truthy($left) ? $left : $right(null);
    }

    public static function jsAnd($left, callable $right): mixed
    {
        return Evaluator::truthy($left) ? $right(null) : $left;
    }
}
