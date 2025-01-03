import { createUnplugin } from 'unplugin'
import {
  type MagicString,
  MagicStringAST,
  REGEX_SETUP_SFC,
  REGEX_SRC_FILE,
  babelParse,
  createFilter,
  generateTransform,
  getLang,
  parseSFC,
  walkAST,
} from '@vue-macros/common'
import { type Options, resolveOption } from './core/options'
import type * as t from '@babel/types'

function transformArguments(argument: t.Node, s: MagicString, offset: number) {
  if (
    [
      'Identifier',
      'MemberExpression',
      'OptionalMemberExpression',
      'TSInstantiationExpression',
    ].includes(argument.type)
  ) {
    s.appendLeft(argument.start! + offset, '$$(')
    s.appendRight(argument.end! + offset, ')')
  } else if (
    argument.type === 'FunctionExpression' ||
    argument.type === 'ArrowFunctionExpression'
  ) {
    transformFunctionReturn(argument, s, offset)
  } else if (argument.type === 'ArrayExpression') {
    argument.elements.forEach((arg) => {
      transformArguments(arg!, s, offset)
    })
  } else if (argument.type === 'ObjectExpression') {
    argument.properties.forEach((prop) => {
      if (prop.type === 'ObjectProperty') {
        // { foo } => { foo: $$(foo) }
        if (prop.shorthand) {
          s.appendLeft(
            prop.value.start! + offset,
            `${prop.key.loc?.identifierName}: `,
          )
        }
        transformArguments(prop.value, s, offset)
      }
    })
  }
}

function transformFunctionReturn(node: t.Node, s: MagicString, offset: number) {
  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  )
    if (node.body.type !== 'BlockStatement') {
      transformArguments(node.body, s, offset)
    } else {
      node.body.body?.forEach((statement) => {
        if (statement.type === 'ReturnStatement' && statement.argument) {
          transformArguments(statement.argument, s, offset)
        }
      })
    }
}

function transformReactivityFunction(
  code: string,
  id: string,
  ignore: string[],
) {
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
    walkAST<t.Node>(ast, {
      enter(node, parent) {
        if (node.type === 'TSNonNullExpression') {
          node = node.expression
        }
        if (node.type === 'CallExpression') {
          if (
            parent?.type === 'VariableDeclarator' &&
            new RegExp(`^\\$(?!(\\$|${ignore.join('|')})?$)`).test(
              s.sliceNode(node.callee, { offset }),
            )
          ) {
            s.appendRight(node.callee.start! + offset + 1, '(')
            s.appendRight(node.end! + offset, ')')
          }

          if (/(?<!^(\$)?)\$$/.test(s.sliceNode(node.callee, { offset }))) {
            s.remove(node.callee.end! + offset - 1, node.callee.end! + offset)

            node.arguments.forEach((argument) => {
              transformArguments(argument, s, offset)
            })
          }
        } else if (
          node.type === 'JSXAttribute' &&
          node.value?.type === 'JSXExpressionContainer' &&
          s.sliceNode(node.name).endsWith('$') &&
          !s.sliceNode(node.name).includes(':$')
        ) {
          s.remove(node.name.end! - 1, node.name.end!)
          if (node.value.expression) {
            s.appendLeft(node.value.expression.start! + offset, '$$(')
            s.appendRight(node.value.expression.end! + offset, ')')
          }
        }
      },
    })
  }

  return generateTransform(s, id)
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
      return transformReactivityFunction(code, id, options.ignore)
    },
  }
})
