/**
 * Creates or updates the Ojin demo journey.
 *
 *   pnpm seed
 *
 * The content itself lives in apps/web/src/journey/seed-ojin.ts so the
 * server can call it on startup when the database is empty.
 */
import { seedOjin } from '../apps/web/src/journey/seed-ojin.ts'

console.log(`journey ready: /j/${seedOjin()}`)
