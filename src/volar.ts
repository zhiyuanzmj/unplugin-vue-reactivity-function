import {
  FileKind,
  type FileRangeCapabilities,
  type Segment,
  type VueLanguagePlugin,
  replaceSourceRange,
} from '@vue/language-core'

function transform({
  codes,
  ast,
  ts,
  source,
}: {
  codes: Segment<FileRangeCapabilities>[]
  ast: import('typescript/lib/tsserverlibrary').SourceFile
  ts: typeof import('typescript/lib/tsserverlibrary')
  source: 'script' | 'scriptSetup'
}) {
  function transformArguments(
    argument: import('typescript/lib/tsserverlibrary').Node
  ) {
    if (ts.isIdentifier(argument) || ts.isPropertyAccessExpression(argument)) {
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

  function transformFunctionReturn(
    node: import('typescript/lib/tsserverlibrary').Node
  ) {
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

  function walkReactivityFunction(
    node: import('typescript/lib/tsserverlibrary').Node,
    parent: import('typescript/lib/tsserverlibrary').Node
  ) {
    if (
      ts.isCallExpression(node) &&
      /^\$(?!(\$|ref|computed|shallowRef|toRef|customRef|defineProp|defineProps|defineModels)?(\(|$))/.test(
        node.expression.getText(ast)
      )
    ) {
      if (node.expression.getText(ast).startsWith('$$')) {
        replaceSourceRange(
          codes,
          source,
          node.expression.getStart(ast, false),
          node.expression.getStart(ast, false) + 2
        )
      } else if (ts.isVariableDeclaration(parent)) {
        replaceSourceRange(
          codes,
          source,
          node.expression.getStart(ast, false) + 1,
          node.expression.getStart(ast, false) + 1,
          '('
        )
        replaceSourceRange(codes, source, node.end, node.end, ')')
      } else {
        replaceSourceRange(
          codes,
          source,
          node.expression.getStart(ast, false),
          node.expression.getStart(ast, false) + 1
        )
      }

      node.arguments.forEach((argument) => {
        transformArguments(argument)
      })
    }

    node.forEachChild((child) => {
      walkReactivityFunction(child, node)
    })
  }

  ast.forEachChild((child) => walkReactivityFunction(child, ast))
}

const plugin: VueLanguagePlugin = ({ modules: { typescript: ts } }) => {
  return {
    name: 'vue-reactivity-function',
    version: 1,
    resolveEmbeddedFile(fileName, sfc, embeddedFile) {
      if (embeddedFile.kind !== FileKind.TypeScriptHostFile) return

      for (const source of ['script', 'scriptSetup'] as const) {
        if (sfc[source]?.ast) {
          transform({
            codes: embeddedFile.content,
            ast: sfc[source]!.ast,
            ts,
            source,
          })
        }
      }
    },
  }
}

// eslint-disable-next-line import/no-default-export
export default plugin
