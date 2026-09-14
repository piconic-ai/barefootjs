// Single source of truth shared by vite.config.ts / build.ts / build-watch.ts / worker.ts.
export const BASE_PATH = process.env.BASE_PATH ?? '/integrations/ssg'
export const OUT_DIR = 'dist/static/components'
export const PORT = 3017
