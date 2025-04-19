import {
  type Code,
  allCodeFeatures,
  createPlugin,
  replaceSourceRange,
} from 'ts-macro'
import { analyze } from '@typescript-eslint/scope-manager'
import {
  type TSESTree,
  parse,
  simpleTraverse,
} from '@typescript-eslint/typescript-estree'
import {
  getMemberExpression,
  getReferences,
  transformArguments,
  transformFunctionReturn,
} from './core/utils'

const HELPER_PREFIX = '__MACROS_'

const plugin = createPlugin<{ ignore?: string[] } | undefined>(
  (
    { vueCompilerOptions },
    options = vueCompilerOptions?.reactivityFunction,
  ) => {
    if (vueCompilerOptions) {
      vueCompilerOptions.macros.defineModel.push('$defineModel')
      vueCompilerOptions.macros.defineExpose.push('defineExpose$')
    }
    const ignore = (options?.ignore || []).map((str) => str.slice(1))
    return {
      name: 'vue-reactivity-function',
      resolveVirtualCode({ filePath, ast, source, codes }) {
        if (!ast.text.includes('$')) return
        try {
          transformReactivityFunction({
            codes,
            source,
            ignore,
            text: ast.text,
          })
        } catch {}
      },
    }
  },
)

export default plugin

function transformReactivityFunction(options: {
  codes: Code[]
  source?: string
  text: string
  ignore: string[]
}) {
  const { codes, source, text, ignore } = options
  const ast = parse(text, {
    sourceType: 'module',
    range: true,
    jsx: true,
  })
  const scopeManager = analyze(ast, {
    sourceType: 'module',
  })
  const unrefs: TSESTree.Identifier[] = []
  const refs: TSESTree.Node[] = []
  let index = 0
  simpleTraverse(
    ast,
    {
      enter(node, parent) {
        if (node.type === 'TSNonNullExpression') {
          node = node.expression
        }
        if (node.type === 'CallExpression') {
          const calleeName = text.slice(...node.callee.range)
          if (calleeName === '$$') {
            refs.push(node.arguments[0])
            replaceSourceRange(
              codes,
              source,
              node.callee.range[0],
              node.callee.range[1],
            )
          } else if (
            parent?.type === 'VariableDeclarator' &&
            (calleeName === '$' ||
              new RegExp(`^\\$(?!(\\$|${ignore.join('|')})?$)`).test(
                calleeName,
              ))
          ) {
            if (parent.id.type === 'Identifier') {
              index++
              const refName = `${HELPER_PREFIX}ref${index}`
              const refsName = `${HELPER_PREFIX}refs_${parent.id.name}`
              replaceSourceRange(
                codes,
                source,
                parent.id.range[0],
                parent.id.range[1],
                refName,
              )
              replaceSourceRange(
                codes,
                source,
                node.range[1],
                node.range[1],
                '\n,',
                `${refsName} = {${parent.id.name}: ${refName}}`,
                '\n,',
                [parent.id.name, source, parent.id.range[0], allCodeFeatures],
                ` = ${refsName}.${parent.id.name}.value`,
              )
              unrefs.push(parent.id)
            } else if (
              parent.id.type === 'ObjectPattern' ||
              parent.id.type === 'ArrayPattern'
            ) {
              index++
              const refName = `${HELPER_PREFIX}ref${index}`
              const toValuesName = `${HELPER_PREFIX}toValues${index}`
              const toRef = `${HELPER_PREFIX}toRef`
              const isObjectPattern = parent.id.type === 'ObjectPattern'
              const props =
                parent.id.type === 'ObjectPattern'
                  ? parent.id.properties
                  : parent.id.elements
              let propIndex = 0
              const toRefs: string[] = []
              const toValues: string[] = []
              let hasRest = false
              for (const prop of props) {
                if (!prop) continue
                if (prop.type === 'RestElement') {
                  hasRest = true
                  continue
                }
                const propKey =
                  isObjectPattern &&
                  prop.type === 'Property' &&
                  prop.key.type === 'Identifier'
                    ? prop.key.name
                    : propIndex++
                const propValue =
                  isObjectPattern && prop.type === 'Property'
                    ? prop.value
                    : prop
                const aliasKey =
                  propValue.type === 'AssignmentPattern'
                    ? propValue.left
                    : propValue
                const defaultValue =
                  propValue.type === 'AssignmentPattern'
                    ? `, ${text.slice(propValue.right.range[0], propValue.right.range[1])}`
                    : ''
                if (aliasKey.type === 'Identifier') {
                  unrefs.push(aliasKey)

                  const helperRefName = `${HELPER_PREFIX}refs_${aliasKey.name}`
                  const resolvedPropKey =
                    parent.id.type === 'ArrayPattern' ? propKey : `'${propKey}'`
                  toRefs.push(
                    `${helperRefName} = {${aliasKey.name}: ${toRef}(${refName}, ${resolvedPropKey}${defaultValue})}`,
                  )
                  toValues.push(
                    `${
                      parent.id.type === 'ObjectPattern' ? `${propKey}:` : ''
                    }${helperRefName}.${aliasKey.name}.value`,
                  )
                }
              }
              replaceSourceRange(
                codes,
                source,
                node.range[1],
                node.range[1],
                '\n,',
                ...toRefs.join('\n,'),
                '\n,',
                `${toValuesName} = `,
                parent.id.type === 'ArrayPattern' ? '[' : '{',
                hasRest ? `...${refName},` : '',
                ...toValues.join('\n,'),
                parent.id.type === 'ArrayPattern' ? ']' : '}',
                '\n,',
                [
                  text.slice(parent.id.range[0], parent.id.range[1]),
                  source,
                  parent.id.range[0],
                  allCodeFeatures,
                ],
                ` = ${toValuesName}`,
              )
              replaceSourceRange(
                codes,
                source,
                parent.id.range[0],
                parent.id.range[1],
                refName,
              )
            }
            replaceSourceRange(
              codes,
              source,
              node.callee.range[0],
              node.callee.range[0] + 1,
            )
          }

          if (calleeName.endsWith('$')) {
            replaceSourceRange(
              codes,
              source,
              node.callee.range[1] - 1,
              node.callee.range[1],
            )

            node.arguments.forEach((argument) => {
              transformArguments(argument, refs)
            })
          }
        } else if (
          node.type === 'JSXAttribute' &&
          node.value?.type === 'JSXExpressionContainer' &&
          node.name.type === 'JSXIdentifier' &&
          node.name.name.endsWith('$') &&
          node.name.name.split('').filter((i) => i === '$').length !== 2
        ) {
          replaceSourceRange(
            codes,
            source,
            node.name.range[1] - 1,
            node.name.range[1],
          )
          if (node.value.expression) {
            refs.push(node.value.expression)
          }
        } else if (
          node.type === 'FunctionDeclaration' &&
          node.id?.type === 'Identifier' &&
          node.id.name.endsWith('$')
        ) {
          transformFunctionReturn(node, refs)
          replaceSourceRange(
            codes,
            source,
            node.id.range[1] - 1,
            node.id.range[1],
          )
        } else if (
          node.type === 'ArrowFunctionExpression' &&
          parent?.type === 'VariableDeclarator' &&
          parent.id?.type === 'Identifier' &&
          parent.id.name.endsWith('$')
        ) {
          transformFunctionReturn(node, refs)
          replaceSourceRange(
            codes,
            source,
            parent.id.range[1] - 1,
            parent.id.range[1],
          )
        }
      },
    },
    true,
  )

  codes.push(
    `declare const { toRef: ${HELPER_PREFIX}toRef }: typeof import('vue')`,
  )
  for (const id of unrefs) {
    const references = getReferences(scopeManager.globalScope!, id)
    for (const { identifier } of references) {
      const node = getMemberExpression(identifier)
      if (refs.includes(node)) {
        replaceSourceRange(
          codes,
          source,
          node.range[0],
          node.range[0],
          `(${id.name},${HELPER_PREFIX}refs_${id.name}.`,
        )
        replaceSourceRange(codes, source, node.range[1], node.range[1], ')')
        const parent = node.parent
        if (parent?.type === 'Property' && parent.shorthand) {
          replaceSourceRange(
            codes,
            source,
            parent.value.range[0],
            parent.value.range[0],
            `${id.name}: `,
          )
        }
      }
    }
  }
}
