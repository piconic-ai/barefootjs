<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Support\ExampleApp;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Char-by-char SSE stream for the AI chat demo. `response()->stream()` (not
 * Laravel 12's `eventStream()`, whose StreamedEvent envelope is a different
 * wire format from the plain `data: "<char>"` frames the shared
 * AIChatInteractive island expects) writes each character with a 30ms delay;
 * the built-in server's worker pool (PHP_CLI_SERVER_WORKERS=8) keeps the
 * blocking loop from stalling other in-flight requests, exactly as in
 * integrations/blade.
 */
final class AiChatController extends Controller
{
    public function stream(): StreamedResponse
    {
        $text = ExampleApp::AI_RESPONSES[array_rand(ExampleApp::AI_RESPONSES)];
        return response()->stream(function () use ($text): void {
            // Turn off every buffering layer PHP itself might apply so each
            // `echo` actually reaches the socket before the next 30ms sleep.
            while (ob_get_level() > 0) {
                ob_end_flush();
            }
            ini_set('output_buffering', 'off');
            ini_set('zlib.output_compression', false);
            foreach (preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
                echo 'data: ' . json_encode($ch) . "\n\n";
                flush();
                usleep(30_000);
            }
            echo "data: [DONE]\n\n";
            flush();
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            // Nginx/Cloudflare-style intermediaries buffer proxied responses
            // by default, which would defeat the whole point of streaming;
            // this header is a no-op when there is no such proxy in front
            // (e.g. local dev) and load-bearing when there is.
            'X-Accel-Buffering' => 'no',
        ]);
    }
}
