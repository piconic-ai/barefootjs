<?php

use App\Http\Controllers\AiChatController;
use App\Http\Controllers\BlogController;
use App\Http\Controllers\PagesController;
use App\Http\Controllers\TodosController;
use App\Support\ExampleApp;
use Illuminate\Support\Facades\Route;

/**
 * Routes are defined UNDER the base prefix (unlike integrations/rails, where
 * config.ru strips it before the framework's router runs): `php artisan
 * serve` receives the full /integrations/laravel/* path, so the prefix lives
 * here -- the Laravel-router equivalent of integrations/blade's `$BASE`
 * dispatch. Same route table shape as that file (and the Twig/Flask/Xslate
 * references before it) so the ports can be diffed side by side.
 */

$base = ExampleApp::base();

// A bare-root request redirects into the base path (mirrors
// integrations/blade's `/` -> `{$BASE}/` redirect).
if ($base !== '') {
    Route::redirect('/', "{$base}/", 302);
}

Route::prefix($base)->group(function (): void {
    // --- static assets: dist/client + dist/styles, mounted under the base
    // path. Explicit routes because the URL path (client/...) doesn't match
    // the filesystem path (dist/client/...).
    Route::get('client/{path}', static fn (string $path) => ExampleApp::serveStaticFile(base_path('dist/client'), $path))
        ->where('path', '.*');
    Route::get('styles/{path}', static fn (string $path) => ExampleApp::serveStaticFile(base_path('dist/styles'), $path))
        ->where('path', '.*');

    // --- component demo pages ---
    Route::get('/', [PagesController::class, 'index']);
    Route::get('counter', [PagesController::class, 'counter']);
    Route::get('toggle', [PagesController::class, 'toggle']);
    Route::get('form', [PagesController::class, 'form']);
    Route::get('reactive-props', [PagesController::class, 'reactiveProps']);
    Route::get('props-reactivity', [PagesController::class, 'propsReactivity']);
    Route::get('conditional-return', [PagesController::class, 'conditionalReturn']);
    Route::get('conditional-return-link', [PagesController::class, 'conditionalReturn']);
    Route::get('portal', [PagesController::class, 'portal']);
    Route::get('ai-chat', [PagesController::class, 'aiChat']);

    // --- AI chat SSE stream ---
    Route::get('api/ai-chat', [AiChatController::class, 'stream']);

    // --- todo pages (with/without @client markers) + the session-cookie
    // REST API. `todos-ssr` reuses the same action with an `ssr` route
    // default (mirrors integrations/rails' `defaults: { ssr: '1' }`).
    Route::get('todos', [TodosController::class, 'index']);
    Route::get('todos-ssr', [TodosController::class, 'index'])->defaults('ssr', '1');
    Route::get('api/todos', [TodosController::class, 'apiIndex']);
    Route::post('api/todos', [TodosController::class, 'apiCreate']);
    Route::post('api/todos/reset', [TodosController::class, 'apiReset']);
    Route::put('api/todos/{id}', [TodosController::class, 'apiUpdate'])->whereNumber('id');
    Route::delete('api/todos/{id}', [TodosController::class, 'apiDestroy'])->whereNumber('id');

    // --- blog: the @barefootjs/router showcase ---
    Route::get('blog', [BlogController::class, 'index']);
    Route::get('blog/posts/{slug}', [BlogController::class, 'post']);
});

// Plain-text 404 for anything else (mirrors integrations/blade's fallthrough;
// Laravel's default HTML error page would be noise for the API routes).
Route::fallback(static fn () => response('Not Found', 404)->header('Content-Type', 'text/plain'));
