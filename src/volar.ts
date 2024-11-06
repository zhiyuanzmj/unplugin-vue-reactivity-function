import { replaceSourceRange } from 'muggle-string'
import { type Code, createPlugin } from 'ts-macro'
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
  source: 'script' | 'scriptSetup' | undefined
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
        getStart(argument, ast, ts),
        getStart(argument, ast, ts),
        '$$(',
      )
      replaceSourceRange(codes, source, argument.end, argument.end, ')')
    } else if (
      ts.isArrowFunction(argument) ||
      ts.isFunctionExpression(argument)
    ) {
      transformFunctionReturn(argument)
    } else if (ts.isArrayLiteralExpression(argument)) {
      ts.forEachChild(argument, (arg) => transformArguments(arg))
    } else if (ts.isObjectLiteralExpression(argument)) {
      argument.properties.forEach((prop) => {
        // { foo } => { foo: $$(foo) }
        if (ts.isShorthandPropertyAssignment(prop)) {
          replaceSourceRange(
            codes,
            source,
            getStart(prop.name, ast, ts),
            getStart(prop.name, ast, ts),
            `${prop.name.escapedText}: $$(`,
          )
          replaceSourceRange(codes, source, prop.name.end, prop.name.end, ')')
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
      } else if (node.body) {
        ts.forEachChild(node.body, (statement) => {
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
          getText(node.expression, ast, ts),
        )
      ) {
        replaceSourceRange(
          codes,
          source,
          getStart(node.expression, ast, ts) + 1,
          getStart(node.expression, ast, ts) + 1,
          '(',
        )
        replaceSourceRange(codes, source, node.end, node.end, ')')
      }

      if (/(?<!^(\$)?)\$$/.test(getText(node.expression, ast, ts))) {
        replaceSourceRange(
          codes,
          source,
          node.expression.end - 1,
          node.expression.end,
        )
        node.arguments.forEach((argument) => {
          transformArguments(argument)
        })
      }
    }

    ts.forEachChild(node, (child) => {
      walkReactivityFunction(child)
    })
  }
  ts.forEachChild(ast, walkReactivityFunction)
}

const plugin = createPlugin<{ ignore?: string[] } | undefined>(
  ({ ts, vueCompilerOptions }, options) => {
    return {
      name: 'vue-reactivity-function',
      resolveVirtualCode({ ast, source, codes }) {
        if (vueCompilerOptions) {
          vueCompilerOptions.macros.defineModel.push('$defineModel')
          vueCompilerOptions.macros.defineExpose.push('defineExpose$')
        }

        transform({
          codes,
          ast,
          ts,
          source,
          ignore: [
            ...ignore,
            ...(options?.ignore || []).map((str) => str.slice(1)),
          ],
        })
      },
    }
  },
)

// eslint-disable-next-line import/no-default-export
export default plugin

function getStart(
  node:
    | import('typescript').Node
    | import('typescript').NodeArray<import('typescript').Node>,
  ast: import('typescript').SourceFile,
  ts: typeof import('typescript'),
): number {
  return (ts as any).getTokenPosOfNode(node, ast)
}

function getText(
  node: import('typescript').Node,
  ast: import('typescript').SourceFile,
  ts: typeof import('typescript'),
): string {
  return ast!.text.slice(getStart(node, ast, ts), node.end)
}
