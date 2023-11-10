import type { FilterPattern } from '@rollup/pluginutils'

declare module '@vue/language-core' {
  export interface VueCompilerOptions {
    reactivityFunction?: {
      include?: FilterPattern
      exclude?: FilterPattern
      ignore?: string[]
    }
  }
}

export {}
