import {
  allCodeFeatures,
  createPlugin,
  getStart,
  getText,
  replaceSourceRange,
  type Code,
} from 'ts-macro'

type Node = import('typescript').Node
type Identifier = import('typescript').Identifier

const HELPER_PREFIX = '_'
function isFunctionType(
  ts: typeof import('typescript'),
  node: Node | undefined | null,
) {
  return (
    !!node &&
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node))
  )
}
const plugin = createPlugin<{ ignore?: string[] } | undefined>(
  (
    { ts, vueCompilerOptions },
    options = vueCompilerOptions?.reactivityFunction,
  ) => {
    if (vueCompilerOptions) {
      vueCompilerOptions.macros.defineModel.push('$defineModel')
      vueCompilerOptions.macros.defineExpose.push('defineExpose$')
    }
    const ignore = (options?.ignore || []).map((str) => str.slice(1))
    return {
      name: 'vue-reactivity-function',
      enforce: 'post',
      resolveVirtualCode({ ast, source, codes }) {
        if (!ast.text.includes('$')) return
        try {
          transformReactivityFunction({
            codes,
            source,
            ignore,
            ts,
            ast,
          })
        } catch {}
      },
    }
  },
)

export default plugin

function transformReactivityFunction(options: {
  codes: Code[]
  source?: string
  ts: typeof import('typescript')
  ast: import('typescript').SourceFile
  ignore: string[]
}) {
  const { codes, source, ts, ast, ignore } = options
  let scope = ast as import('typescript').Node
  let prevScope: import('typescript').Node | undefined

  const refs: Identifier[] = []
  const unRefMap = new Map<Node, Set<string>>()
  const unRefIds: Record<string, number> = Object.create(null)

  let index = 0

  function markUnRefIdentifier(child: Node) {
    if (!ts.isIdentifier(child)) return
    const name = String(child.escapedText)
    if (name in unRefIds) {
      unRefIds[name]++
    } else {
      unRefIds[name] = 1
    }
    ;(unRefMap.get(scope) || unRefMap.set(scope, new Set()).get(scope))!.add(
      name,
    )
  }

  function collectRefs(argument: import('typescript').Node, visiter = true) {
    if (ts.isIdentifier(argument)) {
      refs.push(argument)
    } else if (ts.isCallExpression(argument)) {
      collectRefs(argument.expression)
    } else if (ts.isPropertyAccessExpression(argument)) {
      collectRefs(argument.expression)
    } else if (
      ts.isFunctionExpression(argument) ||
      ts.isArrowFunction(argument)
    ) {
      transformFunctionReturn(argument)
    } else if (ts.isArrayLiteralExpression(argument)) {
      argument.elements.forEach((arg) => {
        collectRefs(arg!)
      })
    } else if (ts.isObjectBindingPattern(argument)) {
      argument.elements.forEach((prop) => {
        if (ts.isBindingElement(prop)) {
          collectRefs(prop.name)
        }
      })
    } else if (visiter) {
      // @ts-ignore
      ts.forEachChild(argument, function walk(node) {
        collectRefs(node, false)
        ts.forEachChild(node, walk)
      })
    }
  }

  function transformFunctionReturn(node: import('typescript').Node) {
    if (
      (ts.isFunctionExpression(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isArrowFunction(node)) &&
      node.body
    ) {
      if (!ts.isBlock(node.body)) {
        collectRefs(node.body)
      } else if (ts.isBlock(node.body)) {
        node.body.statements?.forEach((statement) => {
          if (ts.isReturnStatement(statement) && statement.expression) {
            collectRefs(statement.expression)
          }
        })
      }
    }
  }

  // @ts-ignore
  ts.forEachChild(ast, function walk(node, parent) {
    node.parent = parent
    let tsNonNullExpressionEnd = 0
    if (ts.isNonNullExpression(node)) {
      tsNonNullExpressionEnd = node.end
      node = node.expression
    }

    if (ts.isCallExpression(node)) {
      const calleeName = getText(node.expression, ast, ts)

      if (calleeName === '$$') {
        ts.isIdentifier(node.arguments[0]) && refs.push(node.arguments[0])
        replaceSourceRange(
          codes,
          source,
          node.expression.pos,
          node.expression.end,
        )
      } else if (
        parent &&
        ts.isVariableDeclaration(parent) &&
        (calleeName === '$' ||
          new RegExp(`^\\$(?!(\\$|${ignore.join('|')})?$)`).test(calleeName))
      ) {
        const id = parent.name!
        if (ts.isIdentifier(id)) {
          markUnRefIdentifier(id)
          const start = getStart(id, ast, ts)
          const text = String(id.escapedText)
          index++
          const refName = `${HELPER_PREFIX}ref${index}`
          const refsName = `${HELPER_PREFIX}refs_${text}`
          replaceSourceRange(codes, source, start, id.end, refName)
          replaceSourceRange(
            codes,
            source,
            node.end,
            node.end,
            '\n,',
            `${refsName} = {${text}: ${refName}}`,
            '\n,',
            [text, source, start, allCodeFeatures],
            ` = ${refsName}.${text}.value`,
          )
        } else if (
          ts.isObjectBindingPattern(id) ||
          ts.isArrayBindingPattern(id)
        ) {
          index++
          const refName = `${HELPER_PREFIX}ref${index}`
          const toValuesName = `${HELPER_PREFIX}toValues${index}`
          const toRef = `${HELPER_PREFIX}toRef`
          const isObjectPattern = ts.isObjectBindingPattern(id)
          const props = id.elements
          let propIndex = 0
          const toRefs: string[] = []
          const toValues: string[] = []
          let hasRest = false
          for (const prop of props) {
            if (!ts.isBindingElement(prop)) continue
            // @ts-ignore
            if (prop.dotDotDotToken) {
              hasRest = true
              continue
            }
            const propertyName = prop.propertyName
              ? prop.propertyName
              : prop.name
            const propKey = isObjectPattern
              ? getText(propertyName, ast, ts)
              : propIndex++
            const defaultValue =
              ts.isBindingElement(prop) && prop.initializer
                ? `, ${getText(prop.initializer, ast, ts)}`
                : ''
            if (ts.isIdentifier(prop.name)) {
              markUnRefIdentifier(prop.name)
              const helperRefName = `${HELPER_PREFIX}refs_${prop.name.escapedText}`
              const resolvedPropKey = isObjectPattern ? `'${propKey}'` : propKey
              toRefs.push(
                `${helperRefName} = {${prop.name.escapedText}: ${toRef}(${refName}, ${resolvedPropKey}${defaultValue})}`,
              )
              toValues.push(
                `${
                  prop.propertyName ? '' : `${propKey}:`
                }${helperRefName}.${prop.name.escapedText}.value`,
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
            `\n,${toValuesName} = `,
            isObjectPattern ? '{' : '[',
            hasRest ? `...${refName}, ` : '',
            ...toValues.join(', '),
            isObjectPattern ? '}' : ']',
            '\n,',
            [
              getText(id, ast, ts),
              source,
              getStart(id, ast, ts),
              allCodeFeatures,
            ],
            ` = ${toValuesName}`,
          )
          replaceSourceRange(
            codes,
            source,
            getStart(id, ast, ts),
            id.end,
            refName,
          )
        }
        if (parent.initializer)
          replaceSourceRange(
            codes,
            source,
            getStart(parent.initializer, ast, ts),
            getStart(parent.initializer, ast, ts) + 1,
          )
      }

      if (calleeName.endsWith('$') && !['$', '$$'].includes(calleeName)) {
        replaceSourceRange(
          codes,
          source,
          node.expression.end - 1,
          node.expression.end,
        )

        node.arguments.forEach((argument) => {
          collectRefs(argument)
        })
      }
    } else if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      ts.isIdentifier(node.name) &&
      String(node.name.escapedText).endsWith('$') &&
      String(node.name.escapedText)
        .split('')
        .filter((i) => i === '$').length !== 2
    ) {
      replaceSourceRange(codes, source, node.name.end - 1, node.name.end)
      if (node.initializer.expression) {
        collectRefs(node.initializer.expression)
      }
    } else if (ts.isBlock(node)) {
      scope = node
    } else if (isFunctionType(ts, node)) {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        String(node.name.escapedText).endsWith('$')
      ) {
        transformFunctionReturn(node)
        replaceSourceRange(codes, source, node.name.end - 1, node.name.end)
      } else if (
        ts.isArrowFunction(node) &&
        ts.isVariableDeclaration(parent) &&
        ts.isIdentifier(parent.name) &&
        String(parent.name.escapedText).endsWith('$')
      ) {
        transformFunctionReturn(node)
        replaceSourceRange(codes, source, parent.name.end - 1, parent.name.end)
      }
    }

    ts.forEachChild(node, (child) => {
      walk(child, node)
    })

    if (ts.isBlock(node)) {
      scope = prevScope ?? ast
    }

    if (
      node !==
        (ts.isExpressionStatement(ast.statements[0]) &&
          ast.statements[0].expression) &&
      unRefMap.get(node)
    ) {
      for (const id of unRefMap.get(node)!) {
        unRefIds[id]--
        if (unRefIds[id] === 0) {
          delete unRefIds[id]
        }
      }
      unRefMap.delete(node)
    }
  })

  codes.push(
    `declare const { toRef: ${HELPER_PREFIX}toRef }: typeof import('vue')`,
  )
  for (const identifier of refs) {
    const name = String(identifier.escapedText)
    if (!unRefIds[name]) continue
    replaceSourceRange(
      codes,
      source,
      getStart(identifier, ast, ts),
      getStart(identifier, ast, ts),
      `(${name},${HELPER_PREFIX}refs_${name}.`,
    )
    replaceSourceRange(codes, source, identifier.end, identifier.end, ')')
    if (
      identifier.parent &&
      ts.isShorthandPropertyAssignment(identifier.parent)
    ) {
      replaceSourceRange(
        codes,
        source,
        getStart(identifier.parent.name, ast, ts),
        getStart(identifier.parent.name, ast, ts),
        `${name}: `,
      )
    }
  }
}
