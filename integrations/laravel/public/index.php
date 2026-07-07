<?php

/**
 * Stock Laravel 12 HTTP entry point, plus the same "runtime not found" guard
 * integrations/blade's index.php has (see artisan's docstring for why there
 * is no workspace-package autoload fallback in this integration).
 */

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

if (!is_file(__DIR__.'/../vendor/autoload.php')) {
    http_response_code(500);
    header('Content-Type: text/plain');
    echo "Laravel + BarefootJS runtime not found. Run `bun run build` (or `composer install` after "
        ."`bun run scripts/assemble-deps.ts`) in integrations/laravel first.\n";
    exit(1);
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
(require_once __DIR__.'/../bootstrap/app.php')
    ->handleRequest(Request::capture());
