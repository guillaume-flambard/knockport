/**
 * Cree ou met a jour le parcours de demonstration Ojin.
 *
 *   pnpm seed
 *
 * Le contenu lui meme vit dans apps/web/src/journey/seed-ojin.ts, pour que le
 * serveur puisse l'appeler au demarrage quand la base est vide.
 */
import { seedOjin } from '../apps/web/src/journey/seed-ojin.ts'

console.log(`parcours pret: /j/${seedOjin()}`)
