import { createUnplugin } from 'unplugin'
import {
  REGEX_SETUP_SFC,
  REGEX_SRC_FILE,
  babelParse,
  createFilter,
  generateTransform,
  getLang,
  parseSFC,
  walkAST,
} from '@vue-macros/common'
import { MagicString } from 'vue/compiler-sfc'
import { type Options, resolveOption } from './core/options'
import type * as t from '@babel/types'

function transformArguments(argument: t.Node, s: MagicString, offset: number) {
  if (
    argument.type === 'Identifier' ||
    argument.type === 'MemberExpression' ||
    argument.type === 'OptionalMemberExpression'
  ) {
    s.appendLeft(argument.start! + offset, '$$(')
    s.appendRight(argument.end! + offset, ')')
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
            `${prop.key.loc?.identifierName}: `
          )
        }
        transformArguments(prop.value, s, offset)
      }
    })
  }
}

function transformReactivityFunction(code: string, id: string) {
  const lang = getLang(id)
  let asts: {
    ast: t.Program
    offset: number
  }[] = []
  if (lang === 'vue' || REGEX_SETUP_SFC.test(id)) {
    const { scriptSetup, getSetupAst, script, getScriptAst } = parseSFC(
      code,
      id
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

  const s = new MagicString(code)

  for (const { ast, offset } of asts) {
    walkAST<t.Node>(ast, {
      enter(node, parent) {
        if (
          node.type === 'CallExpression' &&
          node.callee.type === 'Identifier' &&
          /^\$(?!(\$|ref|computed|shallowRef|toRef|customRef|defineProp|defineProps|defineModels)?(\(|$))/.test(
            node.callee.name
          )
        ) {
          if (node.callee.name.startsWith('$$')) {
            s.remove(
              node.callee.start! + offset,
              node.callee.start! + offset + 2
            )
          } else if (parent?.type === 'VariableDeclarator') {
            s.appendRight(node.callee.start! + offset + 1, '(')
            s.appendRight(node.end! + offset, ')')
          } else {
            s.remove(
              node.callee.start! + offset,
              node.callee.start! + offset + 1
            )
          }

          node.arguments.forEach((argument) => {
            transformArguments(argument, s, offset)
          })
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
      return transformReactivityFunction(code, id)
    },
  }
})
