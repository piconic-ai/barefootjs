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
 * methods, hydration markers, child rendering) lives in `BarefootJS`
 * (`packages/adapter-php`). This backend supplies the five engine-specific
 * operations the runtime delegates to, targeting Twig syntax:
 *
 *   encode_json(data)            -> JSON string (injectable encoder)
 *   mark_raw(str)                -> a value Twig emits verbatim (no re-escaping)
 *   materialize(value)           -> resolve a captured-children value to a string
 *   render_named(name, bf, vars) -> render `<name>.twig` with `bf` + vars bound
 *   ident(name)                  -> mangle a template-variable name for this engine
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
     * Options-shaped constructor, mirroring the Python backend's
     * `JinjaBackend(paths=[...], environment_options={...})` keyword style
     * (PHP has no keyword arguments for arrays, so one assoc-array options
     * bag is the canonical calling convention — the same shape the adapter's
     * generated render harness and the integrations use).
     *
     * @param array{
     *   paths?: list<string>,
     *   env?: Environment|null,
     *   json_encoder?: callable|null,
     *   environment_options?: array<string, mixed>,
     * } $options `paths`: template directories (FilesystemLoader);
     *   `env`: pre-built Environment (when given, `paths` and
     *   `environment_options` are ignored); `json_encoder`: overrides the
     *   default canonical (sorted-key) encoder; `environment_options`:
     *   extra Twig\Environment options, merged under the defaults below.
     */
    public function __construct(array $options = [])
    {
        $paths = $options['paths'] ?? [];
        $env = $options['env'] ?? null;
        $this->jsonEncoder = $options['json_encoder'] ?? [self::class, 'defaultJsonEncoder'];
        if ($env !== null) {
            $this->env = $env;
            return;
        }
        $options = ($options['environment_options'] ?? []) + [
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
     * Thin delegation to the shared canonical encoder (`packages/adapter-php`'s
     * `Barefoot\Json::canonicalEncode`) -- kept as a static method on this
     * class (rather than removed outright) because tests/integrations
     * reference `TwigBackend::defaultJsonEncoder` directly.
     */
    public static function defaultJsonEncoder($data): string
    {
        return Json::canonicalEncode($data);
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

    /**
     * Mangle a template-variable name for Twig -- delegates to `twig_ident`
     * (`naming.php`, engine-specific, frozen reserved-word set). Called by
     * `BarefootJS::render_child` (the runtime, `packages/adapter-php`) so the
     * ONE mangling point for props turned into `render_child` template
     * variables stays engine-pluggable rather than hard-coding Twig's
     * reserved-word set into the engine-agnostic runtime.
     */
    public function ident(string $name): string
    {
        return twig_ident($name);
    }
}
