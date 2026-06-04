/**
 * Playground app server (runs inside a Cloudflare Dynamic Worker).
 *
 * A real multi-route Hono app. Each route renders a page component via the
 * shared `renderer` (which wraps it in the HTML document + import map + uno.css
 * + hydration scripts). Page components are barefoot 'use client' components
 * under src/, imported as `./src/<Name>`.
 *
 * This server does NOT serve any `/static/*` assets: the playground host serves
 * barefoot.js, each <Name>.client.js, and uno.css. So this file is pure page
 * routing — add a route + a component per page.
 */

import { Hono } from 'hono'
import { renderer } from './renderer'
import { Home } from './src/Home'
import { Counter } from './src/Counter'

const app = new Hono()

app.use(renderer)

app.get('/', (c) => c.render(<Home />))
app.get('/counter', (c) => c.render(<Counter initial={0} />))

export default app
