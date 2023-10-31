import { defineConfig } from 'vite'
import Inspect from 'vite-plugin-inspect'
import Vue from '@vitejs/plugin-vue'
import VueReactivityFunction from '../src/vite'

export default defineConfig({
  build: {
    outDir: './dist/vite',
  },
  plugins: [
    Vue({
      include: [/\.vue$/],
      reactivityTransform: true,
      script: {
        hoistStatic: false,
      },
    }),
    VueReactivityFunction(),
    Inspect({
      build: true,
    }),
  ],
})
