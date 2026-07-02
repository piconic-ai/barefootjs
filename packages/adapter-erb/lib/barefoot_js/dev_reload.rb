# frozen_string_literal: true

require 'fileutils'

module BarefootJS
  # Framework-agnostic dev-only browser auto-reload for BarefootJS apps.
  #
  # Ruby port of BarefootJS::DevReload (@barefootjs/perl), companion to
  # `barefoot build --watch` in @barefootjs/cli. The CLI drops
  # `<dist>/.dev/build-id` after every successful rebuild that changed output;
  # a browser snippet subscribes to an SSE endpoint that emits `event: reload`
  # when that file changes, so an editor save triggers an automatic reload.
  #
  #   require 'barefoot_js/dev_reload'
  #
  #   # Mount the SSE endpoint (dev only) as a plain Rack app, e.g. from
  #   # config.ru's Rack::Builder:
  #   map "#{BASE}/_bf/reload" do
  #     run BarefootJS::DevReload.to_app(dist_dir: 'dist')
  #   end
  #
  #   # And emit the browser snippet before </body> in your layout:
  #   BarefootJS::DevReload.snippet("#{BASE}/_bf/reload")
  #
  # This is a plain Rack app (not a Sinatra route) so it works the same way
  # under any Rack-based host, mirroring the Perl module's PSGI-app shape.
  module DevReload
    # Sentinel path contract with @barefootjs/cli (DEV_SENTINEL_SUBDIR /
    # DEV_SENTINEL_FILENAME in packages/cli/src/lib/build.ts). Duplicated so
    # this package avoids a runtime dep on the CLI — keep in sync with the CLI.
    DEV_SUBDIR = '.dev'
    BUILD_ID_FILE = 'build-id'

    SCROLL_STORAGE_KEY = '__bf_devreload_scroll'

    # Heartbeat < any reasonable proxy/server idle timeout so a quiet
    # connection doesn't get reaped between rebuilds.
    HEARTBEAT_S = 5
    # Polling instead of a filesystem-event gem (e.g. `listen`) keeps the
    # runtime dependency-free. Sub-second latency is imperceptible next to a
    # browser reload.
    POLL_S = 0.5

    # <dist>/.dev/build-id — the sentinel `barefoot build --watch` rewrites.
    def self.build_id_path(dist_dir)
      File.join(dist_dir, DEV_SUBDIR, BUILD_ID_FILE)
    end

    # Ensure <dist>/.dev exists so the watcher can write the sentinel even if
    # the server started first.
    def self.ensure_dev_dir(dist_dir)
      dev = File.join(dist_dir, DEV_SUBDIR)
      FileUtils.mkdir_p(dev)
      dev
    end

    def self.read_build_id(path)
      return '' unless File.file?(path)

      File.read(path, encoding: 'UTF-8').strip
    rescue Errno::ENOENT
      ''
    end

    # The browser snippet: a small IIFE — EventSource subscriber + scrollY
    # preservation across reloads. Idempotent across duplicate mounts (the
    # window.__bfDevReload guard). Returns a plain HTML string; callers embed
    # it directly (ERB's own `<%=` never auto-escapes, so no `mark_raw` needed
    # the way the Kolon/EP ports require).
    def self.snippet(endpoint)
      ep = js_str(endpoint)
      sk = js_str(SCROLL_STORAGE_KEY)
      "<script>(function(){if(window.__bfDevReload)return;window.__bfDevReload=1;" \
        "try{var s=sessionStorage.getItem(#{sk});if(s){sessionStorage.removeItem(#{sk});" \
        "var y=parseInt(s,10);if(!isNaN(y)){var restore=function(){window.scrollTo(0,y)};" \
        "if(document.readyState==='loading'){addEventListener('DOMContentLoaded',restore,{once:true})}" \
        "else{restore()}}}}catch(e){}var es=new EventSource(#{ep});" \
        "es.addEventListener('reload',function(){try{sessionStorage.setItem(#{sk},String(window.scrollY))}" \
        "catch(e){}location.reload()});es.addEventListener('error',function(){})})();</script>"
    end

    # A ready-made Rack app for the SSE endpoint. Streams `event: reload`
    # whenever <dist>/.dev/build-id changes, with `: hb` heartbeats in
    # between.
    #
    # The response body is a lazy `Enumerator` — Puma (and any Rack server
    # that doesn't buffer the body) writes each yielded chunk to the socket
    # as it's produced, giving true incremental streaming without needing
    # `env['rack.hijack']`. A write failure on a disconnected client surfaces
    # as an exception raised back into the Enumerator's block at the `y <<`
    # call (Ruby re-raises consumer-side exceptions at the fiber's yield
    # point) — the `rescue` below turns that into a clean loop exit, the
    # same role Perl's `local $SIG{PIPE} = 'IGNORE'; eval { ... }` plays.
    #
    # DevReload is automatically a no-op unless mounted, and should only be
    # mounted in development — see app.rb's `DEV` guard.
    def self.to_app(dist_dir: 'dist')
      path = build_id_path(dist_dir)
      ensure_dev_dir(dist_dir)

      lambda do |env|
        last_event_id = (env['HTTP_LAST_EVENT_ID'] || '').strip

        body = Enumerator.new do |y|
          begin
            y << "retry: 1000\n\n"

            initial = read_build_id(path)
            last_sent = ''
            unless initial.empty?
              last_sent = initial
              # A stale Last-Event-ID means a build happened while the client
              # was disconnected — fire `reload` immediately so the missed
              # rebuild doesn't stay unpainted.
              event = (!last_event_id.empty? && last_event_id != initial) ? 'reload' : 'hello'
              y << "event: #{event}\nid: #{initial}\ndata: #{initial}\n\n"
            end

            since_hb = 0
            loop do
              sleep(POLL_S)
              id = read_build_id(path)
              if !id.empty? && id != last_sent
                last_sent = id
                since_hb = 0
                y << "event: reload\nid: #{id}\ndata: #{id}\n\n"
              else
                since_hb += POLL_S
                if since_hb >= HEARTBEAT_S
                  since_hb = 0
                  y << ": hb\n\n"
                end
              end
            end
          rescue IOError, Errno::EPIPE, Errno::ECONNRESET
            # Client disconnected — stop producing chunks.
          end
        end

        # Rack 3 requires lowercase header names (Rack::Lint enforces this in
        # development; Rack 2 accepted either case).
        [200, {
          'content-type' => 'text/event-stream',
          'cache-control' => 'no-cache, no-transform',
          'x-accel-buffering' => 'no',
        }, body]
      end
    end

    # Minimal JS string escape for the handful of characters that can appear
    # in a URL path or storage key. Good enough for package-internal + trusted
    # operator-supplied strings; never interpolate untrusted input here.
    def self.js_str(s)
      t = s.to_s.gsub('\\', '\\\\\\\\').gsub('"', '\\"').gsub("\n", '\\n').gsub("\r", '\\r')
      %("#{t}")
    end
    private_class_method :js_str
  end
end
