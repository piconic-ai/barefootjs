<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Per-session file-backed todo storage -- verbatim port of
 * integrations/blade/index.php's session-store section, for the same reason:
 * `php artisan serve` is the SAME PHP built-in server run with
 * `PHP_CLI_SERVER_WORKERS=8` (see package.json / the Dockerfiles), i.e. 8
 * separate worker PROCESSES with their own memory, round-robining requests.
 * An in-memory array (what the threaded-Puma Rails example uses) would make a
 * browser's todo list flicker between completely different lists depending on
 * which worker answered. So the store is a small JSON file per session id
 * (keyed by the `bf_session` cookie) under the system temp dir, guarded by
 * `flock()` so concurrent requests to the SAME session (even across worker
 * processes) still serialize correctly. No LRU eviction: this is a demo,
 * files are tiny, and OS temp dirs get reaped independently.
 */
final class TodoStore
{
    private static function dir(): string
    {
        $dir = sys_get_temp_dir() . '/barefootjs-laravel-sessions';
        if (!is_dir($dir)) {
            mkdir($dir, 0700, true);
        }
        return $dir;
    }

    private static function file(string $sid): string
    {
        // Session ids are minted hex-only (see BarefootHelper), but guard
        // against a hostile/garbled cookie value reaching the filesystem
        // path anyway.
        $safe = preg_replace('/[^a-zA-Z0-9]/', '', $sid);
        return self::dir() . '/' . $safe . '.json';
    }

    /**
     * Read-modify-write a session's `{todos, next_id}` state under an
     * exclusive lock: `$mutator` receives the current state array and must
     * return `[$newState, $result]`; `$result` is returned to the caller.
     * Opens with `c+` (create-if-missing, don't truncate) so the lock covers
     * the seed-on-first-access case too.
     */
    public static function with(string $sid, callable $mutator)
    {
        $fh = fopen(self::file($sid), 'c+');
        if ($fh === false) {
            throw new \RuntimeException('failed to open session store');
        }
        try {
            flock($fh, LOCK_EX);
            $raw = stream_get_contents($fh);
            $state = ($raw !== false && $raw !== '') ? json_decode($raw, true) : null;
            if (!is_array($state) || !isset($state['todos'], $state['next_id'])) {
                $state = ['todos' => ExampleApp::seedTodos(), 'next_id' => 4];
            }
            [$state, $result] = $mutator($state);
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, json_encode($state));
            fflush($fh);
            return $result;
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }

    /** Shared-lock read-only accessor for routes that only need the current
     * todo list (GET /todos, GET /api/todos) -- avoids taking the exclusive
     * lock `with` needs for a read-modify-write cycle. */
    public static function read(string $sid): array
    {
        $path = self::file($sid);
        if (!is_file($path)) {
            // First visit: seed + persist under the exclusive lock, then return.
            return self::with($sid, static fn (array $s) => [$s, $s]);
        }
        $fh = fopen($path, 'r');
        if ($fh === false) {
            return ['todos' => ExampleApp::seedTodos(), 'next_id' => 4];
        }
        flock($fh, LOCK_SH);
        $raw = stream_get_contents($fh);
        flock($fh, LOCK_UN);
        fclose($fh);
        $state = json_decode((string) $raw, true);
        return (is_array($state) && isset($state['todos'], $state['next_id']))
            ? $state
            : ['todos' => ExampleApp::seedTodos(), 'next_id' => 4];
    }
}
