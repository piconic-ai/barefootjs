<?php

declare(strict_types=1);

namespace App\Providers;

use Barefoot\BladeBackend;
use Illuminate\Support\ServiceProvider;

/**
 * Container wiring for the BarefootJS runtime -- the Laravel-idiomatic
 * counterpart of integrations/blade's top-of-index.php `$backend`
 * construction.
 *
 * One BladeBackend renders every component from dist/templates, wired onto
 * THIS app's own view factory (config/view.php points its paths there) via
 * the `factory` option BladeBackend documents for "integrations that already
 * run a full Laravel application and want to reuse its view Factory". Unlike
 * the plain-PHP sibling there is no standalone illuminate/view stack to
 * assemble: the framework's ViewServiceProvider has already registered the
 * `blade` engine, the FileViewFinder, and the compiled-template cache under
 * storage/framework/views.
 */
final class BarefootServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(BladeBackend::class, static fn ($app) => new BladeBackend([
            'factory' => $app['view'],
        ]));
    }
}
