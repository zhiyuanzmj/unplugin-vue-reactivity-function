import {
  type Code,
  allCodeFeatures,
  createPlugin,
  replaceSourceRange,
} from 'ts-macro'
import { parse } from '@babel/parser'
import _traverse, { type NodePath, type Scope } from '@babel/traverse'
import type * as t from '@babel/types'

const HELPER_PREFIX = '__MACROS_'

const traverse =
  (_traverse as unknown as { default: typeof _traverse }).default || _traverse

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
          const babelAst = parse(ast.text, {
            plugins: ['typescript', 'jsx'],
            sourceType: 'module',
          }).program
          transformReactivityFunction({
            ast: babelAst,
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

// eslint-disable-next-line import/no-default-export
export default plugin

function transformArguments(argument: t.Node, text: string, refs: t.Node[]) {
  if (
    [
      'Identifier',
      'CallExpression',
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
    transformFunctionReturn(argument, text, refs)
  } else if (argument.type === 'ArrayExpression') {
    argument.elements.forEach((arg) => {
      transformArguments(arg!, text, refs)
    })
  } else if (argument.type === 'ObjectExpression') {
    argument.properties.forEach((prop) => {
      if (prop.type === 'ObjectProperty') {
        transformArguments(prop.value, text, refs)
      }
    })
  }
}

function transformFunctionReturn(node: t.Node, text: string, refs: t.Node[]) {
  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  ) {
    if (node.body.type !== 'BlockStatement') {
      transformArguments(node.body, text, refs)
    } else {
      node.body.body?.forEach((statement) => {
        if (statement.type === 'ReturnStatement' && statement.argument) {
          transformArguments(statement.argument, text, refs)
        }
      })
    }
  }
}

function transformReactivityFunction(options: {
  ast: t.Program
  codes: Code[]
  source?: string
  text: string
  ignore: string[]
}) {
  const { ast, codes, source, text, ignore } = options
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
        const calleeName = text.slice(node.callee.start!, node.callee.end!)
        if (calleeName === '$$') {
          refs.push(node.arguments[0])
          replaceSourceRange(
            codes,
            source,
            node.callee.start!,
            node.callee.end!,
          )
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
              parent.id.start!,
              parent.id.end!,
              refName,
            )
            replaceSourceRange(
              codes,
              source,
              node.end!,
              node.end!,
              '\n,',
              `${refsName} = {${parent.id.name}: ${refName}}`,
              '\n,',
              [parent.id.name, source, parent.id.start!, allCodeFeatures],
              ` = ${refsName}.${parent.id.name}.value`,
            )
            unrefs.push({ id: parent.id, scope: path.scope })
          } else if (
            parent.id.type === 'ObjectPattern' ||
            parent.id.type === 'ArrayPattern'
          ) {
            index++
            const refName = `${HELPER_PREFIX}ref${index}`
            const toValuesName = `${HELPER_PREFIX}toValues${index}`
            const toRef = `${HELPER_PREFIX}toRef`
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
                  ? `, ${text.slice(propValue.right.start!, propValue.right.end!)}`
                  : ''
              if (key.type === 'Identifier') {
                unrefs.push({
                  id: key,
                  scope: path.scope,
                })

                const helperRefName = `${HELPER_PREFIX}refs_${key.name}`
                const resolvedPropKey =
                  parent.id.type === 'ArrayPattern' ? propKey : `'${propKey}'`
                toRefs.push(
                  `${helperRefName} = {${key.name}: ${toRef}(${refName}, ${resolvedPropKey}${defaultValue})}`,
                )
                toValues.push(
                  `${
                    parent.id.type === 'ObjectPattern' ? `${propKey}:` : ''
                  }${helperRefName}.${key.name}.value`,
                )
              } else if (key.type === 'RestElement') {
                hasRest = true
              }
            }
            replaceSourceRange(
              codes,
              source,
              node.end!,
              node.end!,
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
                text.slice(parent.id.start!, parent.id.end!),
                source,
                parent.id.start!,
                allCodeFeatures,
              ],
              ` = ${toValuesName}`,
            )
            replaceSourceRange(
              codes,
              source,
              parent.id.start!,
              parent.id.end!,
              refName,
            )
          }
          replaceSourceRange(
            codes,
            source,
            node.callee.start!,
            node.callee.start! + 1,
          )
        }

        if (calleeName.endsWith('$')) {
          replaceSourceRange(
            codes,
            source,
            node.callee.end! - 1,
            node.callee.end!,
          )

          node.arguments.forEach((argument) => {
            transformArguments(argument, text, refs)
          })
        }
      } else if (
        node.type === 'JSXAttribute' &&
        node.value?.type === 'JSXExpressionContainer' &&
        node.name.type === 'JSXIdentifier' &&
        node.name.name.endsWith('$') &&
        node.name.name.split('').filter((i) => i === '$').length !== 2
      ) {
        replaceSourceRange(codes, source, node.name.end! - 1, node.name.end!)
        if (node.value.expression) {
          refs.push(node.value.expression)
        }
      } else if (
        node.type === 'FunctionDeclaration' &&
        node.id?.type === 'Identifier' &&
        node.id.name.endsWith('$')
      ) {
        transformFunctionReturn(node, text, refs)
        replaceSourceRange(codes, source, node.id.end! - 1, node.id.end!)
      } else if (
        node.type === 'ArrowFunctionExpression' &&
        parent.type === 'VariableDeclarator' &&
        parent.id?.type === 'Identifier' &&
        parent.id.name.endsWith('$')
      ) {
        transformFunctionReturn(node, text, refs)
        replaceSourceRange(codes, source, parent.id.end! - 1, parent.id.end!)
      }
    },
    Program: {
      exit() {
        codes.push(
          `declare const { toRef: ${HELPER_PREFIX}toRef }: typeof import('vue')`,
        )
        for (const { id, scope } of unrefs) {
          for (const path of scope.getBinding(id.name)?.referencePaths ?? []) {
            let { node, parent } = path
            node = getMemberExpression(path)
            const ref = refs.includes(node)
            if (ref) {
              replaceSourceRange(
                codes,
                source,
                node.start!,
                node.start!,
                `(${id.name},${HELPER_PREFIX}refs_${id.name}.`,
              )
              replaceSourceRange(codes, source, node.end!, node.end!, ')')
              if (parent.type === 'ObjectProperty' && parent.shorthand) {
                replaceSourceRange(
                  codes,
                  source,
                  parent.value.start!,
                  parent.value.start!,
                  `${parent.key.loc?.identifierName}: `,
                )
              }
            }
          }
        }
      },
    },
  })
}

function getMemberExpression(path: NodePath<t.Node>) {
  if (
    path.parentPath?.node.type === 'MemberExpression' ||
    path.parentPath?.node.type === 'OptionalMemberExpression' ||
    (path.parentPath?.node.type === 'CallExpression' &&
      path.parentPath.node.callee === path.node)
  ) {
    return getMemberExpression(path.parentPath)
  }
  return path.node
}
