import type { BaseOptions } from '@vue-macros/common'

export interface Options extends Pick<BaseOptions, 'include' | 'exclude'> {}

export type OptionsResolved = Pick<Required<Options>, 'include'> &
  Pick<Options, 'exclude'>

export function resolveOption(options: Options): OptionsResolved {
  return {
    include: [/\.([cm]?[jt]sx?|vue)$/],
    ...options,
  }
}
