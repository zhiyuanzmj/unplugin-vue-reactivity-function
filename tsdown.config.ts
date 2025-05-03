import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    define: {
      __BROWSER__: 'true',
      __ESM__: 'true',
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
      __ESM__: 'true',
    },
    entry: ['./src/*.ts', '!./src/*.d.ts'],
    format: 'esm',
    dts: true,
  },
  {
    define: {
      __BROWSER__: 'false',
      __ESM__: 'false',
    },
    entry: ['./src/*.ts', '!./src/*.d.ts'],
    format: 'cjs',
    dts: true,
  },
])
