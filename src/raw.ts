import {
  HELPER_PREFIX,
  MagicStringAST,
  REGEX_SETUP_SFC,
  REGEX_SRC_FILE,
  createFilter,
  generateTransform,
  getLang,
  importHelperFn,
  parseSFC,
} from '@vue-macros/common'
import { analyze } from '@typescript-eslint/scope-manager'
import {
  type TSESTree,
  parse,
  simpleTraverse,
} from '@typescript-eslint/typescript-estree'
import { type Options, resolveOption } from './core/options'
import {
  getMemberExpression,
  getReferences,
  transformArguments,
  transformFunctionReturn,
} from './core/utils'
import type { UnpluginOptions } from 'unplugin'

export function transformReactivityFunction(
  text: string,
  ignore: string[],
  s: MagicStringAST,
) {
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
          const calleeName = s.slice(...node.callee.range)

          if (calleeName === '$$') {
            refs.push(node.arguments[0])
            s.remove(...node.callee.range)
          } else if (
            parent?.type === 'VariableDeclarator' &&
            (calleeName === '$' ||
              new RegExp(`^\\$(?!(\\$|${ignore.join('|')})?$)`).test(
                calleeName,
              ))
          ) {
            if (parent.id.type === 'Identifier') {
              unrefs.push(parent.id)
            } else if (
              parent.id.type === 'ObjectPattern' ||
              parent.id.type === 'ArrayPattern'
            ) {
              const refName = `${HELPER_PREFIX}ref${index++}`
              const toRef = importHelperFn(s, 0, 'toRef')
              const isObjectPattern = parent.id.type === 'ObjectPattern'
              const props =
                parent.id.type === 'ObjectPattern'
                  ? parent.id.properties
                  : parent.id.elements
              let propIndex = 0
              const destructures: string[] = []
              for (const prop of props) {
                if (!prop) continue
                if (
                  prop.type === 'RestElement' &&
                  prop.argument.type === 'Identifier'
                ) {
                  let createPropsRestProxy = importHelperFn(
                    s,
                    0,
                    'createPropsRestProxy',
                  )
                  if (parent.id.type === 'ArrayPattern') {
                    createPropsRestProxy = `Object.values(${createPropsRestProxy}`
                  }
                  s.appendLeft(
                    parent.range[1]!,
                    `\n,${prop.argument.name} = ${createPropsRestProxy}(${refName}, [${destructures.join(', ')}])${
                      parent.id.type === 'ArrayPattern' ? ')' : ''
                    }`,
                  )
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
                    ? `, ${s.slice(...propValue.right.range)}`
                    : ''
                if (aliasKey.type === 'Identifier') {
                  unrefs.push(aliasKey)
                  destructures.push(`'${propKey}'`)
                  s.appendLeft(
                    parent.range[1],
                    `\n,${aliasKey.name} = ${toRef}(${refName}, '${propKey}'${defaultValue})`,
                  )
                }
              }
              s.overwrite(parent.id.range[0]!, parent.id.range[1]!, refName)
            }
            s.remove(node.callee.range[0], node.callee.range[0] + 1)
          }

          if (calleeName.endsWith('$')) {
            s.remove(node.callee.range[1]! - 1, node.callee.range[1]!)

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
          s.remove(node.name.range[1] - 1, node.name.range[1])
          if (node.value.expression) {
            refs.push(node.value.expression)
          }
        } else if (
          node.type === 'FunctionDeclaration' &&
          node.id?.type === 'Identifier' &&
          node.id.name.endsWith('$')
        ) {
          transformFunctionReturn(node, refs)
          s.remove(node.id.range[1] - 1, node.id.range[1])
        } else if (
          node.type === 'ArrowFunctionExpression' &&
          parent?.type === 'VariableDeclarator' &&
          parent.id?.type === 'Identifier' &&
          parent.id.name.endsWith('$')
        ) {
          transformFunctionReturn(node, refs)
          s.remove(parent.id.range[1] - 1, parent.id.range[1])
        }
      },
    },
    true,
  )

  for (const id of unrefs) {
    const references = getReferences(scopeManager.globalScope!, id)
    for (const { identifier } of references) {
      const node = getMemberExpression(identifier)
      if (!refs.includes(node)) {
        const parent = node.parent
        if (parent?.type === 'Property' && parent.shorthand) {
          // { foo } => { foo: foo.value }
          s.appendLeft(parent.value.range[0], `${id.name}: `)
        }
        s.appendLeft(identifier.range[1], '.value')
      }
    }
  }
}

const plugin = (rawOptions: Options = {}): UnpluginOptions => {
  const options = resolveOption(rawOptions)
  const filter = createFilter(options)

  const name = 'unplugin-vue-reactivity-function'
  return {
    name,
    enforce: 'pre',

    transformInclude(id) {
      return filter(id)
    },
    transform(code, id) {
      const lang = getLang(id)
      let asts: {
        text: string
        offset: number
      }[] = []
      if (lang === 'vue' || REGEX_SETUP_SFC.test(id)) {
        const { scriptSetup, script } = parseSFC(code, id)
        if (script?.content) {
          asts.push({
            text: script.content,
            offset: script.loc.start.offset,
          })
        }
        if (scriptSetup) {
          asts.push({
            text: scriptSetup.content!,
            offset: scriptSetup.loc.start.offset,
          })
        }
      } else if (REGEX_SRC_FILE.test(id)) {
        asts = [{ text: code, offset: 0 }]
      } else {
        return
      }

      const s = new MagicStringAST(code)

      for (const { text, offset } of asts) {
        s.offset = offset
        transformReactivityFunction(text, options.ignore, s)
      }

      return generateTransform(s, id)
    },
  }
}
export default plugin
