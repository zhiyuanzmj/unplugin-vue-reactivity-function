import reactivityFunction, {
  type ReactivityFunctionRuleOptions,
} from './reactivity-function'
import type { Linter } from '@typescript-eslint/utils/ts-eslint'

export interface RuleOptions {
  'reactivity-function': ReactivityFunctionRuleOptions
}

export type Rules = Partial<{
  [K in keyof RuleOptions]:
    | Linter.Severity
    | [Linter.Severity, ...RuleOptions[K]]
}>

export default {
  'reactivity-function': reactivityFunction,
}
