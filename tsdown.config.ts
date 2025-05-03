import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/*.ts', '!./src/*.d.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  outputOptions: {
    exports: 'named',
  },
})
