import { analyze } from '@typescript-eslint/scope-manager'
import { walk } from 'estree-walker'
import {
  allCodeFeatures,
  createPlugin,
  replaceSourceRange,
  type Code,
} from 'ts-macro'
import {
  collectRefs,
  getOxcParser,
  getReferences,
  getRequire,
  transformFunctionReturn,
} from './core/utils'
import type { IdentifierName, Node } from 'oxc-parser'

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
      resolveVirtualCode({ ast, source, codes }) {
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

let parseSync: typeof import('oxc-parser').parseSync
if (__BROWSER__) {
  parseSync = await getOxcParser(true)
} else {
  const require = getRequire()
  if (require) {
    parseSync = require('oxc-parser').parseSync
  }
}

function transformReactivityFunction(options: {
  codes: Code[]
  source?: string
  text: string
  ignore: string[]
}) {
  const { codes, source, text, ignore } = options
  const { program } = parseSync('index.tsx', text, {
    sourceType: 'module',
  })
  const unrefs: IdentifierName[] = []
  const refs: Node[] = []
  let index = 0
  walk<Node>(program, {
    leave(node, parent) {
      // @ts-ignore
      node.parent = parent
      // @ts-ignore
      node.range = [node.start, node.end]
    },
    enter(node, parent) {
      let tsNonNullExpressionEnd = 0
      if (node.type === 'TSNonNullExpression') {
        tsNonNullExpressionEnd = node.end
        node = node.expression
      }

      if (node.type === 'CallExpression') {
        const calleeName = text.slice(node.callee.start, node.callee.end)
        if (calleeName === '$$') {
          refs.push(node.arguments[0])
          replaceSourceRange(codes, source, node.callee.start, node.callee.end)
        } else if (
          parent?.type === 'VariableDeclarator' &&
          (calleeName === '$' ||
            new RegExp(`^\\$(?!(\\$|${ignore.join('|')})?$)`).test(calleeName))
        ) {
          if (parent.id.type === 'Identifier') {
            index++
            const refName = `${HELPER_PREFIX}ref${index}`
            const refsName = `${HELPER_PREFIX}refs_${parent.id.name}`
            replaceSourceRange(
              codes,
              source,
              parent.id.start,
              parent.id.end,
              refName,
            )
            replaceSourceRange(
              codes,
              source,
              node.end,
              node.end,
              '\n,',
              `${refsName} = {${parent.id.name}: ${refName}}`,
              '\n,',
              [parent.id.name, source, parent.id.start, allCodeFeatures],
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
                isObjectPattern && prop.type === 'Property' ? prop.value : prop
              const aliasKey =
                propValue.type === 'AssignmentPattern'
                  ? propValue.left
                  : propValue
              const defaultValue =
                propValue.type === 'AssignmentPattern'
                  ? `, ${text.slice(propValue.right.start, propValue.right.end)}`
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
              tsNonNullExpressionEnd || node.end,
              tsNonNullExpressionEnd || node.end,
              '\n,',
              ...toRefs.join('\n,'),
              '\n,',
              `${toValuesName} = `,
              parent.id.type === 'ArrayPattern' ? '[' : '{',
              hasRest ? `...${refName}, ` : '',
              ...toValues.join(', '),
              parent.id.type === 'ArrayPattern' ? ']' : '}',
              '\n,',
              [
                text.slice(parent.id.start, parent.id.end),
                source,
                parent.id.start,
                allCodeFeatures,
              ],
              ` = ${toValuesName}`,
            )
            replaceSourceRange(
              codes,
              source,
              parent.id.start,
              parent.id.end,
              refName,
            )
          }
          replaceSourceRange(
            codes,
            source,
            node.callee.start,
            node.callee.start + 1,
          )
        }

        if (calleeName.endsWith('$')) {
          replaceSourceRange(
            codes,
            source,
            node.callee.end - 1,
            node.callee.end,
          )

          node.arguments.forEach((argument) => {
            collectRefs(argument, refs)
          })
        }
      } else if (
        node.type === 'JSXAttribute' &&
        node.value?.type === 'JSXExpressionContainer' &&
        node.name.type === 'JSXIdentifier' &&
        node.name.name.endsWith('$') &&
        node.name.name.split('').filter((i) => i === '$').length !== 2
      ) {
        replaceSourceRange(codes, source, node.name.end - 1, node.name.end)
        if (node.value.expression) {
          collectRefs(node.value.expression, refs)
        }
      } else if (
        node.type === 'FunctionDeclaration' &&
        node.id?.type === 'Identifier' &&
        node.id.name.endsWith('$')
      ) {
        transformFunctionReturn(node, refs)
        replaceSourceRange(codes, source, node.id.end - 1, node.id.end)
      } else if (
        node.type === 'ArrowFunctionExpression' &&
        parent?.type === 'VariableDeclarator' &&
        parent.id?.type === 'Identifier' &&
        parent.id.name.endsWith('$')
      ) {
        transformFunctionReturn(node, refs)
        replaceSourceRange(codes, source, parent.id.end - 1, parent.id.end)
      }
    },
  })

  codes.push(
    `declare const { toRef: ${HELPER_PREFIX}toRef }: typeof import('vue')`,
  )
  const scopeManager = analyze(program as any, {
    sourceType: 'module',
  })
  for (const id of unrefs) {
    const references = getReferences(scopeManager.globalScope!, id)
    for (const ref of references) {
      const identifier = ref.identifier as unknown as IdentifierName & {
        parent: Node
      }
      if (refs.includes(identifier)) {
        replaceSourceRange(
          codes,
          source,
          identifier.start,
          identifier.start,
          `(${id.name},${HELPER_PREFIX}refs_${id.name}.`,
        )
        replaceSourceRange(codes, source, identifier.end, identifier.end, ')')
        const parent = identifier.parent
        if (parent?.type === 'Property' && parent.shorthand) {
          replaceSourceRange(
            codes,
            source,
            parent.value.start,
            parent.value.start,
            `${id.name}: `,
          )
        }
      }
    }
  }
}
