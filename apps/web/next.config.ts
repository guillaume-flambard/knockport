import type { NextConfig } from 'next'

const config: NextConfig = {
  // @knockport/core est du TypeScript brut, publie tel quel dans le workspace,
  // avec des imports relatifs portant l'extension .ts explicite. Next doit donc
  // le passer par ses propres loaders au lieu de le traiter comme un paquet
  // deja compile.
  transpilePackages: ['@knockport/core'],
}

export default config
