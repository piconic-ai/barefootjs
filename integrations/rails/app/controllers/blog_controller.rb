# frozen_string_literal: true

# Blog — the @barefootjs/router showcase. No server JSX: each page is composed
# in Ruby from individually-rendered island templates (ExampleApp.blog_island),
# all sharing one request-scoped script collector (`root`). Direct port of the
# Sinatra example's blog routes.
class BlogController < ApplicationController
  def index
    root = BarefootJS::Context.new(ExampleApp::BACKEND)
    base = "#{ExampleApp::BASE}/blog"
    sort = params[:sort] || 'date'
    tag = params[:tag] || ''
    items = ExampleApp::BLOG_DATA[:listItems]
    post_list = ExampleApp.blog_island(root, 'PostList',
                                     # Client props (-> bf-p): `visible()` re-derives from these on
                                     # every `searchParams()` change, so they must reach the client.
                                     { items: items, tags: ExampleApp::BLOG_DATA[:allTags], base: base },
                                     {
                                       # SSR-only derived values. `params` from the request query
                                       # (correct server-side labels); `visible` falls back to the
                                       # full list. The per-link sort/tag class+href getters collapse
                                       # to one SSR scalar each (the compiler can't tell
                                       # `sortClass('date')` from `sortClass('title')` statically), so
                                       # seed neutral defaults — the client sets the correct active
                                       # highlight + hrefs from searchParams.
                                       params: { sort: sort, tag: tag },
                                       visible: items,
                                       sortClass: 'sort',
                                       sortHref: base,
                                       tagClass: 'tag',
                                       tagHref: base,
                                     },
                                     { 'post_list_item' => 'PostListItem' })
    now = ExampleApp.blog_island(root, 'NowPlaying', {}, { Math: { min: 0 } })
    title = tag.empty? ? 'Barefoot Blog — Latest posts' : "##{tag} — Barefoot Blog"
    render html: ExampleApp.blog_page(root, title, base, post_list + now).html_safe, layout: false
  end

  def post
    # Sort newest-first (the index's default display order) so the article
    # pager walks down the list the reader is browsing; the corpus is authored
    # oldest-first.
    posts = ExampleApp::BLOG_DATA[:posts].sort_by { |p| p[:date] }.reverse
    i = posts.index { |p| p[:slug] == params[:slug] }
    return render plain: 'Not Found', status: :not_found unless i

    p = posts[i]
    prev_post = i.positive? ? posts[i - 1] : nil
    next_post = i < posts.length - 1 ? posts[i + 1] : nil
    base = "#{ExampleApp::BASE}/blog"
    root = BarefootJS::Context.new(ExampleApp::BACKEND)
    # The whole article is the shared <PostArticle> island; the interactive
    # widgets are its nested children (NowPlaying needs Math seeded).
    content = ExampleApp.blog_island(root, 'PostArticle',
                                   {
                                     slug: p[:slug], title: p[:title], date: p[:date],
                                     tags: p[:tags], body: p[:body],
                                     position: i + 1, total: posts.length, base: base,
                                     prevSlug: prev_post && prev_post[:slug],
                                     prevTitle: prev_post && prev_post[:title],
                                     nextSlug: next_post && next_post[:slug],
                                     nextTitle: next_post && next_post[:title],
                                   },
                                   {},
                                   {
                                     'like_button' => 'LikeButton',
                                     'reading_timer' => 'ReadingTimer',
                                     'now_playing' => ['NowPlaying', { Math: { min: 0 } }],
                                   })
    render html: ExampleApp.blog_page(root, "#{p[:title]} — Barefoot Blog", base, content).html_safe, layout: false
  end
end
