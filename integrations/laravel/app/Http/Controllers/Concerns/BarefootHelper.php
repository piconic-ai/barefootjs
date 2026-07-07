<?php

declare(strict_types=1);

namespace App\Http\Controllers\Concerns;

use App\Support\ExampleApp;
use Barefoot\BarefootJS;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * The Laravel-idiomatic seam for turning a BarefootJS component into a full
 * HTML page -- the counterpart of integrations/rails'
 * app/controllers/concerns/barefoot_helper.rb. Used from the base Controller,
 * it wraps:
 *   * per-request runtime creation + child-renderer registration
 *   * the shared page/layout string builder (see the Blade-layout note below)
 *   * the `bf_session` cookie helpers the todo store keys off
 *
 * --- Blade layouts vs. a shared layout-string helper -----------------------
 * We deliberately do NOT wrap pages in a Blade layout (`@extends` /
 * `{{ $slot }}`), even though this app has a perfectly good view factory.
 * Every page's interactive markup is already a fully-rendered HTML string
 * produced by BladeBackend::render_named; the only remaining job is to wrap
 * it in a <!DOCTYPE html> document. Running that pre-rendered,
 * hydration-critical markup back through a Blade layout would buy nothing
 * (there is no per-page view logic to express) while adding a real hazard:
 * every interpolation would need `{!! !!}` or the `bf-*` hydration attributes
 * and inline scripts get re-escaped. A plain PHP heredoc is the simplest
 * thing that is guaranteed correct, and it keeps this example structurally
 * parallel to integrations/blade so the diff between the two PHP integrations
 * is "framework glue only" -- the same rationale integrations/rails documents
 * for skipping ActionView.
 */
trait BarefootHelper
{
    /**
     * Build a per-request runtime, register child renderers, render the
     * component template, and wrap the result in the page layout. Port of
     * integrations/blade's render_component (same signature, camelCased).
     */
    protected function renderComponent(
        string $component,
        ?string $title = null,
        string $heading = '',
        array $children = [],
        array $signalInit = [],
        array $props = [],
        array $stash = [],
        string $extraCss = '',
        ?string $back = null
    ): string {
        $backend = ExampleApp::backend();
        $bf = new BarefootJS(null, ['backend' => $backend]);
        ExampleApp::newScriptCollector($bf);
        $scopeId = $component . '_' . ExampleApp::randSuffix();
        $bf->_scope_id($scopeId);
        if ($props) {
            $bf->_props($props);
        }

        foreach ($children as $childSlot => $childTemplate) {
            $childInit = $signalInit[$childSlot] ?? null;
            $renderer = function (array $childProps, ?BarefootJS $caller = null) use ($backend, $bf, $scopeId, $childTemplate, $childInit) {
                $childBf = new BarefootJS(null, ['backend' => $backend]);
                // Loop children carry no `_bf_slot`; fall back to template +
                // suffix so each instance gets a distinct scope id (client JS
                // finds children by scope). Slot children pin to
                // <parent>_<slot>.
                $slotId = $childProps['_bf_slot'] ?? null;
                unset($childProps['_bf_slot']);
                $childBf->_scope_id($slotId !== null ? "{$scopeId}_{$slotId}" : $childTemplate . '_' . ExampleApp::randSuffix());
                $childBf->_is_child(true);
                // Share the parent's script collector so a child's
                // register_script de-dupes against the page's existing
                // <script> set (see ExampleApp::newScriptCollector).
                ExampleApp::shareScriptCollector($bf, $childBf);
                $extra = $childInit !== null ? $childInit($childProps) : [];
                return $backend->render_named($childTemplate, $childBf, array_merge($childProps, $extra));
            };
            $bf->register_child_renderer($childSlot, $renderer);
        }

        $ctx = array_merge(ExampleApp::stashFromSsrDefaults($component, $props), $stash);
        $body = $backend->render_named($component, $bf, $ctx);
        return $this->layout(
            title: $title ?? "{$component} - BarefootJS",
            heading: $heading,
            body: $body,
            scripts: $bf->scripts(),
            extraCss: $extraCss,
            back: $back,
        );
    }

    protected function layout(string $title, string $heading, string $body, string $scripts, string $extraCss = '', ?string $back = null): string
    {
        $base = ExampleApp::base();
        $headingHtml = $heading !== '' ? "<h1>{$heading}</h1>" : '';
        // Subpages link back to the example list (base()/); the list page
        // itself passes back='' to suppress the link (the header breadcrumb
        // already navigates up to /integrations).
        $backHref = $back ?? "{$base}/";
        $backHtml = $backHref !== '' ? '<p><a href="' . $backHref . '">&larr; Back</a></p>' : '';
        return <<<HTML
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{$title}</title>
    <link rel="stylesheet" href="{$base}/styles/tokens.css">
    <link rel="stylesheet" href="{$base}/styles/layout.css">
    <link rel="stylesheet" href="{$base}/styles/components.css">
    <link rel="stylesheet" href="{$base}/styles/todo-app.css">
    {$extraCss}
</head>
<body>
    <header class="bf-header">
        <div class="bf-header-inner">
            <a href="https://barefootjs.dev" class="bf-header-logo" aria-label="BarefootJS">
                <span class="bf-header-logo-img" role="img" aria-hidden="true"></span>
            </a>
            <div class="bf-header-sep"></div>
            <nav class="bf-header-crumbs" aria-label="Breadcrumb">
                <a href="/integrations" class="bf-header-link">Integrations</a>
                <span class="bf-header-crumb-sep" aria-hidden="true">/</span>
                <span class="bf-header-current" aria-current="page">Laravel</span>
            </nav>
        </div>
    </header>
    {$headingHtml}
    <div id="app">{$body}</div>
    {$backHtml}
    {$scripts}
</body>
</html>
HTML;
    }

    // -----------------------------------------------------------------------
    // Session cookie helpers -- port of integrations/blade's
    // resolve_session_id / set_session_cookie using Laravel's request/response
    // cookie API. The cookie is set RAW (EncryptCookies is removed from the
    // web group, see bootstrap/app.php) so it stays the same plain opaque id
    // every other integration uses.
    // -----------------------------------------------------------------------

    /** @return array{0: string, 1: bool} `[sid, is_new_cookie]`; the caller
     * attaches the cookie to its response only when a new id was minted. */
    protected function resolveSessionId(Request $request): array
    {
        $sid = $request->cookies->get(ExampleApp::SESSION_COOKIE);
        if (is_string($sid) && preg_match('/^[a-f0-9]{32}$/', $sid)) {
            return [$sid, false];
        }
        return [bin2hex(random_bytes(16)), true];
    }

    protected function sessionCookie(string $sid): Cookie
    {
        $base = ExampleApp::base();
        return cookie(
            name: ExampleApp::SESSION_COOKIE,
            value: $sid,
            minutes: intdiv(ExampleApp::SESSION_TTL_SEC, 60),
            path: $base !== '' ? $base : '/',
            secure: false,
            httpOnly: true,
            sameSite: 'lax',
        );
    }
}
