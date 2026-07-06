<?php

declare(strict_types=1);

namespace Barefoot;

use Illuminate\Contracts\View\Factory as ViewFactory;
use Illuminate\Events\Dispatcher;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\HtmlString;
use Illuminate\View\Compilers\BladeCompiler;
use Illuminate\View\Engines\CompilerEngine;
use Illuminate\View\Engines\EngineResolver;
use Illuminate\View\Engines\PhpEngine;
use Illuminate\View\Factory;
use Illuminate\View\FileViewFinder;

/**
 * Laravel Blade rendering backend for the `BarefootJS` runtime -- port of
 * packages/adapter-twig/php/src/TwigBackend.php (itself a port of
 * packages/adapter-jinja/python/barefootjs/backend_jinja.py's `JinjaBackend`).
 *
 * The engine-agnostic runtime logic (JS-compat value helpers, array/string
 * methods, hydration markers, child rendering) lives in `BarefootJS`
 * (`packages/adapter-php`). This backend supplies the five engine-specific
 * operations the runtime delegates to, targeting Blade syntax, wired onto
 * `illuminate/view` used STANDALONE -- no Laravel application/container is
 * required, only the pieces `Illuminate\View\ViewServiceProvider` wires up
 * (`Filesystem`, an event `Dispatcher`, an `EngineResolver` registering a
 * `blade` engine (`CompilerEngine` over a `BladeCompiler`), a
 * `FileViewFinder`, and the `Factory` that ties them together):
 *
 *   encode_json(data)            -> JSON string (injectable encoder)
 *   mark_raw(str)                -> a value Blade emits verbatim (no re-escaping)
 *   materialize(value)           -> resolve a captured-children value to a string
 *   render_named(name, bf, vars) -> render `<name>.blade.php` with `bf` + vars bound
 *   ident(name)                  -> mangle a template-variable name for this engine
 *
 * Pair it with the `@barefootjs/blade` compile-time adapter, which emits
 * `.blade.php` templates that call the runtime as a `$bf` object:
 * `{{ $bf->scope_attr() }}`, `{{ $bf->json($x) }}`, `{{ $bf->spread_attrs($bag) }}`.
 *
 * Escaping note (empirically verified against illuminate/view 12.x, see the
 * adapter design doc). Blade's plain `{{ $x }}` echo compiles to
 * `<?php echo e($x); ?>`. `Illuminate\Support\e()` special-cases any value
 * implementing `Illuminate\Contracts\Support\Htmlable` -- it calls
 * `->toHtml()` and returns it VERBATIM, skipping `htmlspecialchars()`
 * entirely; every other value is escaped via `htmlspecialchars($value,
 * ENT_QUOTES, ..., $doubleEncode = true)`. `mark_raw` below returns an
 * `Illuminate\Support\HtmlString`, which implements `Htmlable` -- so a
 * value this backend has marked raw (e.g. `BarefootJS::spread_attrs`'s
 * return value) passes through a plain `{{ }}` unescaped for free, with no
 * `{!! !!}` needed at THAT call site; call sites that receive an ordinary
 * PHP string this runtime does NOT wrap (e.g. `hydration_attrs()`,
 * `text_start()`/`text_end()`, `comment()`, `scope_comment()`,
 * `render_child()`'s return value) must use the compiler's `{!! ... !!}`
 * raw-echo form instead (mirrors Twig's explicit `| raw` filter at those
 * same call sites). `ENT_QUOTES` emits NAMED entity forms
 * (`&quot;`/`&#039;`), same byte-form difference as Twig's default escaper
 * relative to Perl/Go/markupsafe's numeric forms (`&#34;`/`&#39;`) -- the
 * adapter-tests harness's `normalizeHTML` canonicalizes entity forms before
 * comparison, so this is conformance-equivalent, not a special case. The
 * runtime's OWN escape paths that bypass autoescaping via `mark_raw`
 * (`BarefootJS::spread_attrs`, and the inline quote-escaping in
 * `hydration_attrs`/`data_key_attr`) still emit numeric entities directly,
 * ported unchanged from `BarefootJS.pm`'s `_html_escape`.
 */
final class BladeBackend
{
    private ViewFactory $factory;

    /** @var callable(mixed): string */
    private $jsonEncoder;

    /**
     * Options-shaped constructor, mirroring `TwigBackend`'s
     * `(paths: [...], cache_dir: ..., json_encoder: ...)` assoc-array
     * calling convention (PHP has no keyword arguments for arrays, so one
     * options bag is the canonical shape across every backend in this
     * repo).
     *
     * @param array{
     *   paths?: list<string>,
     *   cache_dir?: string|null,
     *   json_encoder?: callable|null,
     *   factory?: ViewFactory|null,
     * } $options `paths`: template directories (`FileViewFinder`);
     *   `cache_dir`: directory for Blade's compiled-template cache (defaults
     *   to a subdirectory of `sys_get_temp_dir()`, created if missing);
     *   `json_encoder`: overrides the default canonical (sorted-key)
     *   encoder; `factory`: a pre-built `Illuminate\Contracts\View\Factory`
     *   (when given, `paths`/`cache_dir` are ignored and the caller owns
     *   wiring the `blade` engine — used by integrations that already run a
     *   full Laravel application and want to reuse its view Factory).
     */
    public function __construct(array $options = [])
    {
        $this->jsonEncoder = $options['json_encoder'] ?? [self::class, 'defaultJsonEncoder'];

        if (isset($options['factory'])) {
            $this->factory = $options['factory'];
            return;
        }

        $paths = $options['paths'] ?? [];
        $cacheDir = $options['cache_dir'] ?? (sys_get_temp_dir() . '/barefootjs-blade-cache');
        if (!is_dir($cacheDir)) {
            mkdir($cacheDir, 0777, true);
        }

        $files = new Filesystem();
        $compiler = new BladeCompiler($files, $cacheDir);
        $resolver = new EngineResolver();
        $resolver->register('blade', static fn () => new CompilerEngine($compiler, $files));
        $resolver->register('php', static fn () => new PhpEngine($files));

        $finder = new FileViewFinder($files, $paths);
        $events = new Dispatcher();

        $this->factory = new Factory($resolver, $finder, $events);
    }

    public function factory(): ViewFactory
    {
        return $this->factory;
    }

    /**
     * Thin delegation to the shared canonical encoder (`packages/adapter-php`'s
     * `Barefoot\Json::canonicalEncode`) -- kept as a static method on this
     * class (rather than removed outright) because tests/integrations
     * reference `BladeBackend::defaultJsonEncoder` directly.
     */
    public static function defaultJsonEncoder($data): string
    {
        return Json::canonicalEncode($data);
    }

    public function encode_json($data): string
    {
        return ($this->jsonEncoder)($data);
    }

    /** Mark a string as already-safe so a plain `{{ }}` echo emits it
     * verbatim (no auto-escape) -- see the file header for how
     * `Illuminate\Support\e()`'s `Htmlable` fast path makes this work
     * without a `{!! !!}` at the call site. */
    public function mark_raw($s): HtmlString
    {
        return new HtmlString($s === null ? '' : (string) $s);
    }

    /** JSX children captured by the adapter resolve to a string (or an
     * `HtmlString`) here -- the ONE uniform children/fallback capture
     * mechanism (`@php(ob_start())` ... `@php($NAME = $bf->backend->mark_raw(ob_get_clean()))`,
     * see `blade-adapter.ts`'s file header) already produces a rendered
     * value directly, but `materialize` still supports a callable for
     * parity with the Perl/Python/Twig ports' contract and any lazy-render
     * composition built on top of this backend. */
    public function materialize($value)
    {
        return is_callable($value) ? $value() : $value;
    }

    /**
     * Render `<name>.blade.php` with `$childBf` bound as the `bf` variable
     * for the nested render, plus the supplied template vars. Reserved-word
     * mangling (`blade_ident`) is applied here -- the ONE point every props
     * value is turned into template variables -- so a prop literally named
     * e.g. `bf` or `this` doesn't collide with the render-time PHP scope
     * (see `naming.php`'s docstring for the full rationale and reserved set).
     */
    public function render_named(string $name, $childBf, $variables): string
    {
        $varsArr = $variables instanceof \stdClass ? get_object_vars($variables) : (is_array($variables) ? $variables : []);
        $mangled = [];
        foreach ($varsArr as $k => $v) {
            $mangled[blade_ident((string) $k)] = $v;
        }
        $mangled['bf'] = $childBf;
        return $this->factory->make($name, $mangled)->render();
    }

    /**
     * Mangle a template-variable name for Blade -- delegates to
     * `blade_ident` (`naming.php`, engine-specific, frozen reserved-word
     * set). Called by `BarefootJS::render_child` (the runtime,
     * `packages/adapter-php`) so the ONE mangling point for props turned
     * into `render_child` template variables stays engine-pluggable rather
     * than hard-coding Blade's reserved-word set into the engine-agnostic
     * runtime.
     */
    public function ident(string $name): string
    {
        return blade_ident($name);
    }
}
