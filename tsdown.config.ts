import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    define: {
      __BROWSER__: 'true',
    },
    entry: {
      'volar-browser': './src/volar.ts',
    },
    format: 'esm',
    dts: true,
  },
  {
    define: {
      __BROWSER__: 'false',
    },
    entry: ['./src/*.ts', '!./src/*.d.ts'],
    format: ['cjs', 'esm'],
    dts: true,
  },
])
