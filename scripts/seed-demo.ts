/**
 * Creates or updates the demo journey.
 *
 *   pnpm seed
 *
 * The content itself lives in apps/web/src/journey/seed-demo.ts so the
 * server can call it on startup when the database is empty.
 */
import { seedDemo } from '../apps/web/src/journey/seed-demo.ts'

console.log(`journey ready: /j/${seedDemo()}`)
