import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'index.ts',
    client: 'client.ts',
    'client/hooks': 'client/hooks.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  // Don't bundle peer deps so consumers use their versions
  external: ['better-auth', 'better-auth/client', 'react', '@tanstack/react-query', 'razorpay'],
  // Keep node_modules (razorpay, zod) in bundle for server entry; client entries tree-shake
  noExternal: ['zod'],
})
