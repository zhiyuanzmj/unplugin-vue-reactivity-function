import Vue from '@vitejs/plugin-vue'
import VueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig } from 'vite'
import Inspect from 'vite-plugin-inspect'
import VueReactivityFunction from '../src/vite'

export default defineConfig({
  build: {
    outDir: './dist/vite',
  },
  plugins: [
    VueReactivityFunction({
      ignore: ['$fetch'],
    }),
    Vue(),
    VueJsx(),
    Inspect({
      build: true,
    }),
  ],
})
