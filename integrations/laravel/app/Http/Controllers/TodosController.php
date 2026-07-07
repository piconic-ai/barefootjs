<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Support\ExampleApp;
use App\Support\TodoStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as BaseResponse;

/**
 * Todo pages (with/without @client markers) + the session-cookie REST API.
 * Port of integrations/blade's todo routes; the store is the same
 * file-backed, flock-guarded JSON store (see App\Support\TodoStore for why
 * an in-memory array doesn't survive `PHP_CLI_SERVER_WORKERS=8`).
 */
final class TodosController extends Controller
{
    public function index(Request $request, ?string $ssr = null): Response
    {
        [$sid, $minted] = $this->resolveSessionId($request);
        $state = TodoStore::read($sid);
        $todos = $state['todos'];
        $done = count(array_filter($todos, static fn ($t) => $t['done']));
        $component = $ssr !== null ? 'TodoAppSSR' : 'TodoApp';
        $response = response($this->renderComponent(
            $component,
            children: ['todo_item' => 'TodoItem'],
            props: ['initialTodos' => $todos],
            stash: ['todos' => $todos, 'newText' => '', 'filter' => 'all', 'doneCount' => $done],
        ));
        return $this->withSessionCookie($response, $sid, $minted);
    }

    // --- todo REST API ---

    public function apiIndex(Request $request): BaseResponse
    {
        [$sid, $minted] = $this->resolveSessionId($request);
        $state = TodoStore::read($sid);
        return $this->withSessionCookie(response()->json($state['todos']), $sid, $minted);
    }

    public function apiCreate(Request $request): BaseResponse
    {
        [$sid, $minted] = $this->resolveSessionId($request);
        $body = $request->json()->all();
        $todo = TodoStore::with($sid, static function (array $state) use ($body) {
            $newTodo = ['id' => $state['next_id'], 'text' => $body['text'] ?? null, 'done' => false, 'editing' => false];
            $state['todos'][] = $newTodo;
            $state['next_id']++;
            return [$state, $newTodo];
        });
        return $this->withSessionCookie(response()->json($todo, 201), $sid, $minted);
    }

    public function apiUpdate(Request $request, int $id): BaseResponse
    {
        [$sid, $minted] = $this->resolveSessionId($request);
        $body = $request->json()->all();
        $todo = TodoStore::with($sid, static function (array $state) use ($id, $body) {
            foreach ($state['todos'] as &$t) {
                if ($t['id'] !== $id) {
                    continue;
                }
                if (array_key_exists('text', $body)) {
                    $t['text'] = $body['text'];
                }
                if (array_key_exists('done', $body)) {
                    $t['done'] = (bool) $body['done'];
                }
                return [$state, $t];
            }
            return [$state, null];
        });
        $response = $todo === null
            ? response()->json(['error' => 'not found'], 404)
            : response()->json($todo);
        return $this->withSessionCookie($response, $sid, $minted);
    }

    public function apiDestroy(Request $request, int $id): BaseResponse
    {
        [$sid] = $this->resolveSessionId($request);
        TodoStore::with($sid, static function (array $state) use ($id) {
            $state['todos'] = array_values(array_filter($state['todos'], static fn ($t) => $t['id'] !== $id));
            return [$state, null];
        });
        return response()->noContent();
    }

    public function apiReset(Request $request): BaseResponse
    {
        [$sid, $minted] = $this->resolveSessionId($request);
        TodoStore::with($sid, static fn (array $state) => [['todos' => ExampleApp::seedTodos(), 'next_id' => 4], null]);
        return $this->withSessionCookie(response('ok')->header('Content-Type', 'text/plain'), $sid, $minted);
    }

    /** Attach the raw `bf_session` cookie only when a new id was minted
     * (mirrors integrations/blade's `if ($minted) set_session_cookie(...)`
     * call sites). */
    private function withSessionCookie(BaseResponse $response, string $sid, bool $minted): BaseResponse
    {
        if ($minted) {
            $response->headers->setCookie($this->sessionCookie($sid));
        }
        return $response;
    }
}
