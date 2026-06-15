# Blog example

A deliberately plain server-rendered blog used to validate the router's core promise: ordinary links and ordinary full-page HTML responses become fast partial navigations, while the page shell remains mounted.

```sh
bun packages/router/example/server.ts
```

Open <http://localhost:3000/blog/first-route>. The example has no client-side route table and sends no router-specific request header. Disable JavaScript and the same links still work as normal document navigations.

The server bundles the router directly from its source at startup, so the
example also works from a clean checkout before any package build.

To verify a real browser navigation and capture the result, leave the server
running and execute:

```sh
bun packages/router/example/capture.ts
```

The capture script clicks the second post, asserts that the original shell DOM
node survived the navigation, and writes `packages/router/example/blog-example.png`.
