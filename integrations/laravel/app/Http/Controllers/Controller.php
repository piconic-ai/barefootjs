<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\BarefootHelper;

abstract class Controller
{
    use BarefootHelper;

    /**
     * Cache-Control for a session-free demo route: cacheable at the Workers
     * Cache layer regardless of a stale bf_session cookie the visitor's
     * browser may still be sending from an earlier /todos visit (see
     * integrations/shared/lib/cache-control.ts).
     */
    protected const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';
}
