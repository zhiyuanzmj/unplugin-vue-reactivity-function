import { sxzz } from '@sxzz/eslint-config'
import reactivityFunction from './dist/eslint.js'

export default sxzz()
  .overrideRules({
    'unused-imports/no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'off',
    'import/no-default-export': 'off',
  })
  .append(
    reactivityFunction({
      ignores: ['**/*.md/**'],
      rules: {
        'reactivity-function': 1,
      },
    }),
  )
