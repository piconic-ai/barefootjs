<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Support\ExampleApp;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The static-ish page group: the example index plus every non-todo, non-blog
 * component demo. Each action is a 1:1 port of the matching
 * integrations/blade route (same compiled templates, same stash/props), the
 * way integrations/rails' PagesController ports the Sinatra routes.
 */
final class PagesController extends Controller
{
    public function index(): Response
    {
        $base = ExampleApp::base();
        $body = <<<HTML
<p>This example renders the same shared JSX components with Blade under a
hand-trimmed Laravel app (routing + controllers only, no Eloquent / asset
pipeline). Rendering goes through @barefootjs/blade's PHP runtime wired onto
this app's own Blade view factory.</p>
<ul>
    <li><a href="{$base}/counter">Counter</a></li>
    <li><a href="{$base}/toggle">Toggle</a></li>
    <li><a href="{$base}/todos">Todo (@client)</a></li>
    <li><a href="{$base}/todos-ssr">Todo (no @client markers)</a></li>
    <li><a href="{$base}/ai-chat">AI Chat (SSE Streaming)</a></li>
    <li><a href="{$base}/blog">Blog (@barefootjs/router - partial navigation)</a></li>
</ul>
HTML;
        return response($this->layout(
            title: 'BarefootJS + Laravel Example',
            heading: 'BarefootJS + Laravel Example',
            body: $body,
            scripts: '',
            back: '',
        ));
    }

    public function counter(): Response
    {
        return response($this->renderComponent('Counter', heading: 'Counter Component'));
    }

    public function toggle(): Response
    {
        $items = [
            ['label' => 'Setting 1', 'defaultOn' => true],
            ['label' => 'Setting 2', 'defaultOn' => false],
            ['label' => 'Setting 3', 'defaultOn' => false],
        ];
        return response($this->renderComponent(
            'Toggle',
            heading: 'Toggle Component',
            children: ['toggle_item' => 'ToggleItem'],
            props: ['toggleItems' => $items],
            stash: ['toggleItems' => $items],
        ));
    }

    public function form(): Response
    {
        return response($this->renderComponent('Form', heading: 'Form Example', props: [], stash: ['accepted' => false]));
    }

    public function reactiveProps(): Response
    {
        return response($this->renderComponent(
            'ReactiveProps',
            heading: 'Reactive Props Test',
            children: ['reactive_child' => 'ReactiveChild'],
            props: [],
            stash: ['count' => 0, 'doubled' => 0],
        ));
    }

    /**
     * Not in the home page's headline route list, but required: the shared
     * `reactive-props.spec.ts` e2e suite has a "Props Access" describe block
     * that navigates to `${baseUrl}/props-reactivity` -- see
     * integrations/shared/e2e/reactive-props.spec.ts. No signalInit override
     * needed: PropsStyleChild / DestructuredStyleChild's compiled templates
     * already derive `displayValue` in-template.
     */
    public function propsReactivity(): Response
    {
        return response($this->renderComponent(
            'PropsReactivityComparison',
            heading: 'Props Reactivity Comparison',
            children: [
                'props_style_child' => 'PropsStyleChild',
                'destructured_style_child' => 'DestructuredStyleChild',
            ],
            props: [],
            stash: ['count' => 1],
        ));
    }

    public function conditionalReturn(Request $request): Response
    {
        $variant = str_ends_with($request->path(), '-link') ? 'link' : '';
        return response($this->renderComponent(
            'ConditionalReturn',
            heading: 'Conditional Return Example' . ($variant !== '' ? ' (Link)' : ''),
            props: ['variant' => $variant],
            stash: ['variant' => $variant, 'count' => 0],
        ));
    }

    public function portal(): Response
    {
        return response($this->renderComponent('PortalExample', heading: 'Portal Example', props: [], stash: ['open' => false]));
    }

    public function aiChat(): Response
    {
        $base = ExampleApp::base();
        return response($this->renderComponent(
            'AIChatInteractive',
            title: 'AI Chat -- SSE Streaming (Laravel)',
            heading: 'AI Chat -- SSE Streaming',
            stash: ['messages' => [], 'input' => '', 'streamingText' => '', 'isStreaming' => false],
            extraCss: "<link rel=\"stylesheet\" href=\"{$base}/styles/ai-chat.css\">",
        ));
    }
}
