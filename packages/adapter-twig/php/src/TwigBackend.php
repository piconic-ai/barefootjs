<?php

declare(strict_types=1);

namespace Barefoot;

use Twig\Environment;
use Twig\Loader\FilesystemLoader;
use Twig\Markup;

/**
 * Twig rendering backend for the `BarefootJS` runtime -- port of
 * packages/adapter-jinja/python/barefootjs/backend_jinja.py's `JinjaBackend`
 * (itself the Python analogue of packages/adapter-xslate/lib/BarefootJS/Backend/Xslate.pm).
 *
 * The engine-agnostic runtime logic (JS-compat value helpers, array/string
 * methods, hydration markers, child rendering) lives in `BarefootJS`. This
 * backend supplies the four engine-specific operations the runtime
 * delegates to, targeting Twig syntax:
 *
 *   encode_json(data)            -> JSON string (injectable encoder)
 *   mark_raw(str)                -> a value Twig emits verbatim (no re-escaping)
 *   materialize(value)           -> resolve a captured-children value to a string
 *   render_named(name, bf, vars) -> render `<name>.twig` with `bf` + vars bound
 *
 * Pair it with the `@barefootjs/twig` compile-time adapter, which emits
 * `.twig` templates that call the runtime as a `bf` object:
 * `{{ bf.scope_attr() }}`, `{{ bf.json(x) }}`, `{{ bf.spread_attrs(bag) }}`.
 *
 * Escaping note (orchestrator-verified, see the adapter design doc section
 * 2): Twig 3.x's `EscaperRuntime::setEscaper()` cannot override a BUILT-IN
 * strategy name like `'html'` -- `EscaperExtension` matches built-in
 * strategies in a switch before any custom escaper registered under that
 * name is ever consulted, so a custom 'html' escaper would silently never
 * run. This backend therefore uses Twig's own default `'html'` autoescape
 * strategy (`htmlspecialchars`-based, emitting `&quot;`/`&#039;`) for plain
 * `{{ }}` interpolation, rather than trying to match the numeric-entity
 * form (`&#34;`/`&#39;`) the other adapters' autoescaping uses. This is
 * conformance-equivalent: the adapter-tests harness's `normalizeHTML`
 * canonicalizes entity forms before comparison. The runtime's OWN escape
 * paths that bypass autoescaping via `mark_raw` (`BarefootJS::spread_attrs`,
 * and the inline quote-escaping in `hydration_attrs`/`data_key_attr`) still
 * emit numeric entities directly, ported unchanged from `BarefootJS.pm`'s
 * `_html_escape`.
 */
final class TwigBackend
{
    private Environment $env;

    /** @var callable(mixed): string */
    private $jsonEncoder;

    /**
     * @param list<string> $paths Template directories (FilesystemLoader).
     * @param Environment|null $env Pre-built Environment; when given, $paths
     *   and $environmentOptions are ignored.
     * @param callable|null $jsonEncoder Overrides the default canonical
     *   (sorted-key) encoder.
     * @param array<string, mixed> $environmentOptions Extra Twig\Environment
     *   options, merged under the defaults below.
     */
    public function __construct(
        array $paths = [],
        ?Environment $env = null,
        ?callable $jsonEncoder = null,
        array $environmentOptions = []
    ) {
        $this->jsonEncoder = $jsonEncoder ?? [self::class, 'defaultJsonEncoder'];
        if ($env !== null) {
            $this->env = $env;
            return;
        }
        $options = $environmentOptions + [
            'autoescape' => 'html',
            'strict_variables' => false,
            'cache' => false,
        ];
        $this->env = new Environment(new FilesystemLoader($paths), $options);
    }

    public function env(): Environment
    {
        return $this->env;
    }

    /**
     * `sort_keys` parity with the Python backend's `default_json_encoder`
     * (`sort_keys=True`) / the Xslate backend's `JSON::PP->canonical`: keys
     * are recursively sorted so output is deterministic. `JSON_UNESCAPED_SLASHES`
     * matches `JSON.stringify`'s un-escaped `/`. Non-ASCII is `\uXXXX`-escaped
     * (PHP's default, matching Python's default `ensure_ascii`).
     */
    public static function defaultJsonEncoder($data): string
    {
        $prepared = self::prepareForJson($data);
        $json = json_encode($prepared, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new \RuntimeException('encode_json failed: ' . json_last_error_msg());
        }
        return $json;
    }

    /**
     * Recursively replace non-finite floats with `null` (JSON has no
     * NaN/Infinity -- matches `JSON.stringify(NaN)` at any depth) and sort
     * object keys (stdClass or a non-list/assoc array) for canonical,
     * deterministic output. List arrays are recursed element-wise without
     * reordering.
     */
    private static function prepareForJson($value)
    {
        if (is_float($value)) {
            return (is_nan($value) || is_infinite($value)) ? null : $value;
        }
        if ($value instanceof \stdClass) {
            $vars = get_object_vars($value);
            ksort($vars, SORT_STRING);
            $out = new \stdClass();
            foreach ($vars as $k => $v) {
                $out->$k = self::prepareForJson($v);
            }
            return $out;
        }
        if (is_array($value)) {
            if (array_is_list($value)) {
                return array_map([self::class, 'prepareForJson'], $value);
            }
            $out = [];
            foreach ($value as $k => $v) {
                $out[$k] = self::prepareForJson($v);
            }
            ksort($out, SORT_STRING);
            return $out;
        }
        return $value;
    }

    public function encode_json($data): string
    {
        return ($this->jsonEncoder)($data);
    }

    /** Mark a string as already-safe so Twig emits it verbatim (no
     * auto-escape). */
    public function mark_raw($s): Markup
    {
        return new Markup($s === null ? '' : (string) $s, 'UTF-8');
    }

    /** JSX children captured by the adapter resolve to a string (or a
     * Markup) here. Twig's `{% set children %}...{% endset %}` capture
     * block already produces a rendered value directly, but `materialize`
     * still supports a callable for parity with the Perl/Python ports'
     * contract and any lazy-render composition built on top of this
     * backend. */
    public function materialize($value)
    {
        return is_callable($value) ? $value() : $value;
    }

    /**
     * Render `<name>.twig` with `$childBf` bound as the `bf` variable for
     * the nested render, plus the supplied template vars. Reserved-word
     * mangling (`twig_ident`) is applied here -- the ONE point every props
     * value is turned into template variables -- so a prop literally named
     * e.g. `for` or `filter` doesn't collide with Twig syntax.
     */
    public function render_named(string $name, $childBf, $variables): string
    {
        $template = $this->env->load($name . '.twig');
        $varsArr = $variables instanceof \stdClass ? get_object_vars($variables) : (is_array($variables) ? $variables : []);
        $mangled = [];
        foreach ($varsArr as $k => $v) {
            $mangled[twig_ident((string) $k)] = $v;
        }
        $mangled['bf'] = $childBf;
        return $template->render($mangled);
    }
}
