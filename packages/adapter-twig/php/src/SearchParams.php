<?php

declare(strict_types=1);

namespace Barefoot;

/**
 * Port of packages/adapter-perl/lib/BarefootJS/SearchParams.pm (see also the
 * Python port packages/adapter-jinja/python/barefootjs/search_params.py).
 *
 * Request-scoped SSR view of the query string behind the reactive
 * `searchParams()` environment signal (router v0.5, #1922). The framework
 * integration builds one per request from the request URL and threads it
 * into the template scope as `searchParams`; the compiled template reads it
 * via `{{ searchParams.get('key') }}`.
 *
 * Semantics mirror the browser's `URLSearchParams.get` exactly under the
 * adapters' `?? ->` lowering: `get()` returns the first value for a key, or
 * `null` when the key is absent -- Twig's native `??` coalesces both
 * "undefined" and `null`, so `searchParams.get('sort') ?? 'name'` falls back
 * only when the key is truly absent, while a present-but-empty value
 * (`?sort=`) keeps the empty string.
 */
final class SearchParams
{
    /** @var array<string, list<string>> */
    private array $values = [];

    public function __construct(string $query = '')
    {
        if (str_starts_with($query, '?')) {
            $query = substr($query, 1);
        }
        foreach (preg_split('/[&;]/', $query) as $pair) {
            if ($pair === '') {
                continue;
            }
            $eq = strpos($pair, '=');
            if ($eq === false) {
                $key = $pair;
                $rawVal = null;
            } else {
                $key = substr($pair, 0, $eq);
                $rawVal = substr($pair, $eq + 1);
            }
            $decodedKey = self::decode($key);
            $decodedVal = $rawVal !== null ? self::decode($rawVal) : '';
            $this->values[$decodedKey][] = $decodedVal;
        }
    }

    /** First value for `$key`, or `null` when the key is absent. A
     * present-but-empty value returns ''. */
    public function get(string $key): ?string
    {
        $vals = $this->values[$key] ?? null;
        if (!$vals) {
            return null;
        }
        return $vals[0];
    }

    /** Percent/`+`-decode a query-string component, mirroring
     * `URLSearchParams`'s `application/x-www-form-urlencoded` parsing. Never
     * raises on malformed input -- PHP strings are raw byte sequences, so an
     * invalid UTF-8 byte run is simply carried through unchanged (the same
     * lenient behaviour Perl's `utf8::decode` -- which never dies -- gives). */
    private static function decode(string $s): string
    {
        $s = str_replace('+', ' ', $s);
        return (string) preg_replace_callback(
            '/%([0-9A-Fa-f]{2})/',
            static fn (array $m) => chr((int) hexdec($m[1])),
            $s
        );
    }
}
