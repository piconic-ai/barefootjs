<?php

use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\View\Middleware\ShareErrorsFromSession;

/**
 * Hand-trimmed Laravel boot -- the PHP counterpart of integrations/rails'
 * config/application.rb: keep routing + controllers + the view layer, strip
 * the stateful HTTP middleware this showcase doesn't use. There is no
 * database, no mail, no queue and no asset pipeline in play; client assets
 * are the host-built dist/ files served by explicit routes (see
 * routes/web.php).
 */
return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(remove: [
            // The only cookie is the plain opaque `bf_session` id every other
            // integration sets raw (the client never reads it; the server
            // regex-validates it) -- encrypting it here would break parity
            // with the shared session-cookie shape AND drag in an APP_KEY
            // requirement nothing else needs.
            EncryptCookies::class,
            // No server-side session state: the todo store keys off the
            // bf_session cookie directly (see App\Support\TodoStore). Laravel
            // sessions would need a driver + storage this example doesn't
            // have. ShareErrorsFromSession depends on StartSession.
            StartSession::class,
            ShareErrorsFromSession::class,
            // Stateless JSON API + hydration showcase -- no CSRF tokens
            // (mirrors integrations/rails' `skip_forgery_protection`; the
            // plain-PHP/Twig/Blade siblings have no forgery protection at
            // all).
            ValidateCsrfToken::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })
    ->create();
