import type { NextConfig } from 'next'

const config: NextConfig = {
  // @knockport/core is raw TypeScript, published as-is in the workspace,
  // with relative imports carrying the explicit .ts extension. Next must
  // therefore pass it through its own loaders instead of treating it as an
  // already-compiled package.
  transpilePackages: ['@knockport/core'],
}

export default config
