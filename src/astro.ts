import unplugin from '.'
import type { Options } from './core/options'

export default (options: Options) => ({
  name: 'unplugin-vue-reactivity-function',
  hooks: {
    'astro:config:setup': (astro: any) => {
      astro.config.vite.plugins ||= []
      astro.config.vite.plugins.push(unplugin.vite(options))
    },
  },
})
