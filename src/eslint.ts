import rules, { type Rules } from './eslint/index'
import type { Linter } from 'eslint'

export const plugins = {
  'reactivity-function': {
    rules,
  },
}

export { rules, type Rules }

export default ({ rules = {}, ...options }: Linter.Config<Rules> = {}) => ({
  name: 'reactivity-function',
  plugins,
  rules: {
    'reactivity-function/reactivity-function':
      rules['reactivity-function'] || 1,
  } satisfies Rules & Record<string, unknown>,
  ...options,
})
