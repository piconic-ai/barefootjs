<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Support\ExampleApp;
use Barefoot\BarefootJS;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Blog -- the @barefootjs/router showcase. No server JSX: each page is
 * composed in PHP from individually-rendered island templates
 * (ExampleApp::blogIsland), all sharing one request-scoped script collector
 * (`$root`). Port of integrations/blade's blog routes; see that file's blog
 * section docstring for the searchParams() SSR seeding rationale (#2076).
 */
final class BlogController extends Controller
{
    public function index(Request $request): Response
    {
        $backend = ExampleApp::backend();
        $root = new BarefootJS(null, ['backend' => $backend]);
        ExampleApp::newScriptCollector($root);
        $base = ExampleApp::base() . '/blog';
        $sort = ExampleApp::asSortKey($request->query('sort'));
        $tag = (string) $request->query('tag', '');
        $items = ExampleApp::blogData()['listItems'];
        $postList = ExampleApp::blogIsland(
            $root,
            'PostList',
            // Client props (-> bf-p): `visible()` re-derives from these on
            // every `searchParams()` change, so they must reach the client.
            ['items' => $items, 'tags' => ExampleApp::blogData()['allTags'], 'base' => $base],
            [
                // SSR-only derived values -- what the static extractor cannot
                // supply; see integrations/blade's blog section docstring.
                'params' => ['sort' => $sort, 'tag' => $tag],
                'visible' => $items,
                'sortClass' => 'sort',
                'root' => $base,
                'tagClass' => 'tag',
            ],
            ['post_list_item' => 'PostListItem'],
        );
        $now = ExampleApp::blogIsland($root, 'NowPlaying', [], ['Math' => ['min' => 0]]);
        $title = $tag !== '' ? "#{$tag} \u{2014} Barefoot Blog" : 'Barefoot Blog \u{2014} Latest posts';
        return response(ExampleApp::blogPage($root, $title, $base, $postList . $now));
    }

    public function post(string $slug): Response
    {
        $backend = ExampleApp::backend();
        // Sort newest-first (the index's default display order) so the
        // article pager walks down the list the reader is browsing; the
        // corpus is authored oldest-first.
        $posts = ExampleApp::blogData()['posts'];
        usort($posts, static fn ($a, $b) => strcmp($b['date'], $a['date']));
        $idx = null;
        foreach ($posts as $i => $p) {
            if ($p['slug'] === $slug) {
                $idx = $i;
                break;
            }
        }
        if ($idx === null) {
            return response('Not Found', 404)->header('Content-Type', 'text/plain');
        }
        $p = $posts[$idx];
        $prevPost = $idx > 0 ? $posts[$idx - 1] : null;
        $nextPost = $idx < count($posts) - 1 ? $posts[$idx + 1] : null;
        $base = ExampleApp::base() . '/blog';
        $root = new BarefootJS(null, ['backend' => $backend]);
        ExampleApp::newScriptCollector($root);
        // The whole article is the shared <PostArticle> island; the
        // interactive widgets are its nested children (NowPlaying needs Math
        // seeded).
        $content = ExampleApp::blogIsland(
            $root,
            'PostArticle',
            [
                'slug' => $p['slug'], 'title' => $p['title'], 'date' => $p['date'],
                'tags' => $p['tags'], 'body' => $p['body'],
                'position' => $idx + 1, 'total' => count($posts), 'base' => $base,
                'prevSlug' => $prevPost['slug'] ?? null,
                'prevTitle' => $prevPost['title'] ?? null,
                'nextSlug' => $nextPost['slug'] ?? null,
                'nextTitle' => $nextPost['title'] ?? null,
            ],
            [],
            [
                'like_button' => 'LikeButton',
                'reading_timer' => 'ReadingTimer',
                'now_playing' => ['NowPlaying', ['Math' => ['min' => 0]]],
            ],
        );
        return response(ExampleApp::blogPage($root, "{$p['title']} \u{2014} Barefoot Blog", $base, $content));
    }
}
