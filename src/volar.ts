import {
  type Code,
  type VueLanguagePlugin,
  replaceSourceRange,
} from '@vue/language-core'
import { ignore } from './core/options'

function transform({
  codes,
  ast,
  ts,
  source,
  ignore,
}: {
  codes: Code[]
  ast: import('typescript').SourceFile
  ts: typeof import('typescript')
  source: 'script' | 'scriptSetup'
  ignore: string[]
}) {
  function transformArguments(argument: import('typescript').Node) {
    if (
      ts.isIdentifier(argument) ||
      ts.isPropertyAccessExpression(argument) ||
      ts.isExpressionWithTypeArguments(argument)
    ) {
      replaceSourceRange(
        codes,
        source,
        argument.getStart(ast, false),
        argument.getStart(ast, false),
        '$$('
      )
      replaceSourceRange(
        codes,
        source,
        argument.getEnd(),
        argument.getEnd(),
        ')'
      )
    } else if (
      ts.isArrowFunction(argument) ||
      ts.isFunctionExpression(argument)
    ) {
      transformFunctionReturn(argument)
    } else if (ts.isArrayLiteralExpression(argument)) {
      argument.forEachChild((arg) => transformArguments(arg))
    } else if (ts.isObjectLiteralExpression(argument)) {
      argument.properties.forEach((prop) => {
        // { foo } => { foo: $$(foo) }
        if (ts.isShorthandPropertyAssignment(prop)) {
          replaceSourceRange(
            codes,
            source,
            prop.name.getStart(ast, false),
            prop.name.getStart(ast, false),
            `${prop.name.escapedText}: $$(`
          )
          replaceSourceRange(
            codes,
            source,
            prop.name.getEnd(),
            prop.name.getEnd(),
            ')'
          )
        } else if (ts.isPropertyAssignment(prop)) {
          transformArguments(prop.initializer)
        }
      })
    }
  }

  function transformFunctionReturn(node: import('typescript').Node) {
    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node)
    ) {
      if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
        transformArguments(node.body)
      } else {
        node.body?.forEachChild((statement) => {
          if (ts.isReturnStatement(statement) && statement.expression) {
            transformArguments(statement.expression)
          }
        })
      }
    }
  }

  function walkReactivityFunction(node: import('typescript').Node) {
    if (ts.isCallExpression(node)) {
      if (
        new RegExp(`^\\$(?!(\\$|${ignore.join('|')})?$)`).test(
          node.expression.getText(ast)
        )
      ) {
        replaceSourceRange(
          codes,
          source,
          node.expression.getStart(ast, false) + 1,
          node.expression.getStart(ast, false) + 1,
          '('
        )
        replaceSourceRange(codes, source, node.getEnd(), node.getEnd(), ')')
      }

      if (/(?<!^(\$)?)\$$/.test(node.expression.getText(ast))) {
        replaceSourceRange(
          codes,
          source,
          node.expression.getEnd() - 1,
          node.expression.getEnd()
        )
        node.arguments.forEach((argument) => {
          transformArguments(argument)
        })
      }
    }

    node.forEachChild((child) => {
      walkReactivityFunction(child)
    })
  }
  ast.forEachChild(walkReactivityFunction)
}

const plugin: VueLanguagePlugin = ({
  modules: { typescript: ts },
  vueCompilerOptions,
}) => {
  return {
    name: 'vue-reactivity-function',
    version: 2,
    resolveEmbeddedCode(fileName, sfc, embeddedFile) {
      vueCompilerOptions.macros.defineModel.push('$defineModel')
      vueCompilerOptions.macros.defineExpose.push('defineExpose$')

      for (const source of ['script', 'scriptSetup'] as const) {
        if (sfc[source]?.ast) {
          transform({
            codes: embeddedFile.content,
            ast: sfc[source]!.ast,
            ts,
            source,
            ignore: [
              ...ignore,
              ...(vueCompilerOptions.reactivityFunction?.ignore || []).map(
                (str) => str.slice(1)
              ),
            ],
          })
        }
      }
    },
  }
}

// eslint-disable-next-line import/no-default-export
export default plugin
