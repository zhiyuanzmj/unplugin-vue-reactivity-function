import process from 'node:process'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['./src/*.ts'],
  format: ['cjs', 'esm'],
  target: 'node16.14',
  splitting: true,
  // noExternal: ['estree-walker'],
  cjsInterop: true,
  minify: process.argv.includes('--minify'),
  clean: true,
  dts: true,
})
