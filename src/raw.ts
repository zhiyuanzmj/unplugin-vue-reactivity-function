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
import { type IdentifierName, type Node, parseSync } from 'oxc-parser'
import { walk } from 'estree-walker'
import { type Options, resolveOption } from './core/options'
import {
  collectRefs,
  getReferences,
  transformFunctionReturn,
} from './core/utils'
import type { UnpluginOptions } from 'unplugin'

export function transformReactivityFunction(
  code: string,
  ignore: string[],
  s: MagicStringAST,
) {
  const { program } = parseSync('index.tsx', code, {
    sourceType: 'module',
  })
  const scopeManager = analyze(program as any, {
    sourceType: 'module',
  })

  const unrefs: IdentifierName[] = []
  const refs: Node[] = []
  let index = 0
  // @ts-ignore
  walk(program, {
    leave(node, parent) {
      // @ts-ignore
      node.parent = parent
    },
    enter(node: Node, parent: Node) {
      if (node.type === 'TSNonNullExpression') {
        node = node.expression
      }
      if (node.type === 'CallExpression') {
        const calleeName = s.slice(node.callee.start, node.callee.end)

        if (calleeName === '$$') {
          refs.push(node.arguments[0])
          s.remove(node.callee.start, node.callee.end)
        } else if (
          parent?.type === 'VariableDeclarator' &&
          (calleeName === '$' ||
            new RegExp(`^\\$(?!(\\$|${ignore.join('|')})?$)`).test(calleeName))
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
                  parent.end,
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
                isObjectPattern && prop.type === 'Property' ? prop.value : prop
              const aliasKey =
                propValue.type === 'AssignmentPattern'
                  ? propValue.left
                  : propValue
              const defaultValue =
                propValue.type === 'AssignmentPattern'
                  ? `, ${s.slice(propValue.right.start, propValue.right.end)}`
                  : ''
              if (aliasKey.type === 'Identifier') {
                unrefs.push(aliasKey)
                destructures.push(`'${propKey}'`)
                s.appendLeft(
                  parent.end,
                  `\n,${aliasKey.name} = ${toRef}(${refName}, '${propKey}'${defaultValue})`,
                )
              }
            }
            s.overwrite(parent.id.start, parent.id.end, refName)
          }
          s.remove(node.callee.start, node.callee.start + 1)
        }

        if (calleeName.endsWith('$')) {
          s.remove(node.callee.end - 1, node.callee.end)

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
        s.remove(node.name.end - 1, node.name.end)
        if (node.value.expression) {
          collectRefs(node.value.expression, refs)
        }
      } else if (
        node.type === 'FunctionDeclaration' &&
        node.id?.type === 'Identifier' &&
        node.id.name.endsWith('$')
      ) {
        transformFunctionReturn(node, refs)
        s.remove(node.id.end - 1, node.id.end)
      } else if (
        node.type === 'ArrowFunctionExpression' &&
        parent?.type === 'VariableDeclarator' &&
        parent.id?.type === 'Identifier' &&
        parent.id.name.endsWith('$')
      ) {
        transformFunctionReturn(node, refs)
        s.remove(parent.id.end - 1, parent.id.end)
      }
    },
  })

  for (const id of unrefs) {
    const references = getReferences(scopeManager.globalScope!, id)
    for (const ref of references) {
      const identifier = ref.identifier as unknown as IdentifierName & {
        parent: Node
      }
      if (!refs.includes(identifier)) {
        const parent = identifier.parent
        if (parent?.type === 'Property' && parent.shorthand) {
          // { foo } => { foo: foo.value }
          s.appendLeft(identifier.start, `${id.name}: `)
        }
        s.appendLeft(identifier.end, '.value')
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
