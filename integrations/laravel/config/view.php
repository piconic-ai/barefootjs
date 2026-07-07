<?php

/**
 * Point the app's OWN view factory at the BarefootJS build output: `bf build`
 * (see barefoot.config.ts) compiles the shared JSX into *.blade.php templates
 * under dist/templates, and `Barefoot\BladeBackend` reuses this factory (see
 * App\Providers\BarefootServiceProvider) instead of wiring up a standalone
 * illuminate/view stack the way integrations/blade does.
 *
 * The framework's CompilerEngine compares each view's mtime against its
 * compiled cache file and recompiles on mismatch, so the default compiled
 * path below is correct in both dev (edits from `bun run build:watch` render
 * on the next request) and production (a warm compiled-template cache
 * survives across requests) -- the same no-DEV-switch rationale documented on
 * integrations/blade's `$backend` construction.
 */
return [
    'paths' => [base_path('dist/templates')],
    'compiled' => env('VIEW_COMPILED_PATH', realpath(storage_path('framework/views')) ?: storage_path('framework/views')),
];
