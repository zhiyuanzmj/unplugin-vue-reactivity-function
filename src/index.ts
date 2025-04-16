import { createUnplugin } from 'unplugin'
import {
  HELPER_PREFIX,
  type MagicString,
  MagicStringAST,
  REGEX_SETUP_SFC,
  REGEX_SRC_FILE,
  babelParse,
  createFilter,
  generateTransform,
  getLang,
  importHelperFn,
  parseSFC,
} from '@vue-macros/common'
import _traverse, { type Scope } from '@babel/traverse'
import { type Options, resolveOption } from './core/options'
import type * as t from '@babel/types'

const traverse =
  (_traverse as unknown as { default: typeof _traverse }).default || _traverse

function transformArguments(argument: t.Node, s: MagicString, refs: t.Node[]) {
  if (
    [
      'Identifier',
      'MemberExpression',
      'OptionalMemberExpression',
      'TSInstantiationExpression',
    ].includes(argument.type)
  ) {
    refs.push(argument)
  } else if (
    argument.type === 'FunctionExpression' ||
    argument.type === 'ArrowFunctionExpression'
  ) {
    transformFunctionReturn(argument, s, refs)
  } else if (argument.type === 'ArrayExpression') {
    argument.elements.forEach((arg) => {
      transformArguments(arg!, s, refs)
    })
  } else if (argument.type === 'ObjectExpression') {
    argument.properties.forEach((prop) => {
      if (prop.type === 'ObjectProperty') {
        transformArguments(prop.value, s, refs)
      }
    })
  }
}

function transformFunctionReturn(node: t.Node, s: MagicString, refs: t.Node[]) {
  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  ) {
    if (node.body.type !== 'BlockStatement') {
      transformArguments(node.body, s, refs)
    } else {
      node.body.body?.forEach((statement) => {
        if (statement.type === 'ReturnStatement' && statement.argument) {
          transformArguments(statement.argument, s, refs)
        }
      })
    }
  }
}

export function transformReactivityFunction(
  ast: t.Program,
  ignore: string[],
  s: MagicStringAST,
) {
  const unrefs: { id: t.Identifier; scope: Scope }[] = []
  const refs: t.Node[] = []
  let index = 0
  traverse({ program: ast, type: 'File' } satisfies t.File, {
    enter(path) {
      let { node, parent } = path
      if (node.type === 'TSNonNullExpression') {
        node = node.expression
      }
      if (node.type === 'CallExpression') {
        const calleeName = s.sliceNode(node.callee)
        if (calleeName === '$$') {
          refs.push(node.arguments[0])
          s.remove(node.callee.start!, node.callee.end!)
        } else if (
          parent?.type === 'VariableDeclarator' &&
          (calleeName === '$' ||
            new RegExp(`^\\$(?!(\\$|${ignore.join('|')})?$)`).test(calleeName))
        ) {
          if (parent.id.type === 'Identifier') {
            unrefs.push({ id: parent.id, scope: path.scope })
          } else if (
            parent.id.type === 'ObjectPattern' ||
            parent.id.type === 'ArrayPattern'
          ) {
            const temp = `${HELPER_PREFIX}ref${index++}`
            const toRef = importHelperFn(s, 0, 'toRef')
            const props =
              parent.id.type === 'ObjectPattern'
                ? parent.id.properties
                : parent.id.elements
            let propIndex = 0
            const destructures: string[] = []
            for (const prop of props) {
              if (!prop) continue
              const propKey =
                prop.type === 'ObjectProperty' && prop.key.type === 'Identifier'
                  ? prop.key.name
                  : propIndex++
              const propValue =
                prop.type === 'ObjectProperty' ? prop.value : prop
              const key =
                propValue.type === 'AssignmentPattern'
                  ? propValue.left
                  : propValue
              const defaultValue =
                propValue.type === 'AssignmentPattern'
                  ? `, ${s.slice(propValue.right.start!, propValue.right.end!)}`
                  : ''
              if (key.type === 'Identifier') {
                unrefs.push({
                  id: key,
                  scope: path.scope,
                })
                destructures.push(`'${propKey}'`)
                s.appendLeft(
                  parent.end!,
                  `\n,${key.name} = ${toRef}(${temp}, '${propKey}'${defaultValue})`,
                )
              } else if (
                key.type === 'RestElement' &&
                key.argument.type === 'Identifier'
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
                  parent.end!,
                  `\n,${key.argument.name} = ${createPropsRestProxy}(${temp}, [${destructures.join(', ')}])${
                    parent.id.type === 'ArrayPattern' ? ')' : ''
                  }`,
                )
              }
            }
            s.overwrite(parent.id.start!, parent.id.end!, temp)
          }
          s.remove(node.callee.start!, node.callee.start! + 1)
        }

        if (calleeName.endsWith('$')) {
          s.remove(node.callee.end! - 1, node.callee.end!)

          node.arguments.forEach((argument) => {
            transformArguments(argument, s, refs)
          })
        }
      } else if (
        node.type === 'JSXAttribute' &&
        node.value?.type === 'JSXExpressionContainer' &&
        node.name.type === 'JSXIdentifier' &&
        node.name.name.endsWith('$') &&
        node.name.name.split('').filter((i) => i === '$').length !== 2
      ) {
        s.remove(node.name.end! - 1, node.name.end!)
        if (node.value.expression) {
          refs.push(node.value.expression)
        }
      } else if (
        node.type === 'FunctionDeclaration' &&
        node.id?.type === 'Identifier' &&
        node.id.name.endsWith('$')
      ) {
        transformFunctionReturn(node, s, refs)
        s.remove(node.id.end! - 1, node.id.end!)
      } else if (
        node.type === 'ArrowFunctionExpression' &&
        parent.type === 'VariableDeclarator' &&
        parent.id?.type === 'Identifier' &&
        parent.id.name.endsWith('$')
      ) {
        transformFunctionReturn(node, s, refs)
        s.remove(parent.id.end! - 1, parent.id.end!)
      }
    },
    Program: {
      exit() {
        for (const { id, scope } of unrefs) {
          for (const { node, parent } of scope.getBinding(id.name)
            ?.referencePaths ?? []) {
            if (!refs.includes(node)) {
              if (parent.type === 'ObjectProperty' && parent.shorthand) {
                // { foo } => { foo: foo.value }
                s.appendLeft(
                  parent.value.start!,
                  `${parent.key.loc?.identifierName}: `,
                )
              }
              s.appendLeft(node.end!, '.value')
            }
          }
        }
      },
    },
  })
}

export default createUnplugin<Options | undefined, false>((rawOptions = {}) => {
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
        ast: t.Program
        offset: number
      }[] = []
      if (lang === 'vue' || REGEX_SETUP_SFC.test(id)) {
        const { scriptSetup, getSetupAst, script, getScriptAst } = parseSFC(
          code,
          id,
        )
        if (script) {
          asts.push({ ast: getScriptAst()!, offset: script.loc.start.offset })
        }
        if (scriptSetup) {
          asts.push({
            ast: getSetupAst()!,
            offset: scriptSetup.loc.start.offset,
          })
        }
      } else if (REGEX_SRC_FILE.test(id)) {
        asts = [{ ast: babelParse(code, lang), offset: 0 }]
      } else {
        return
      }

      const s = new MagicStringAST(code)

      for (const { ast, offset } of asts) {
        s.offset = offset
        transformReactivityFunction(ast, options.ignore, s)
      }

      return generateTransform(s, id)
    },
  }
})
