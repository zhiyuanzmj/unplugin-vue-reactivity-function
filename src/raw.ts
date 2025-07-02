import {
  babelParse,
  createFilter,
  extractIdentifiers,
  generateTransform,
  getLang,
  HELPER_PREFIX,
  importHelperFn,
  isForStatement,
  isFunctionType,
  isReferencedIdentifier,
  MagicStringAST,
  parseSFC,
  REGEX_SETUP_SFC,
  REGEX_SRC_FILE,
  walkFunctionParams,
} from '@vue-macros/common'
import { walk } from 'estree-walker'
import { resolveOption, type Options } from './core/options'
import type {
  BlockStatement,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  Identifier,
  JSXIdentifier,
  Node,
  Program,
} from '@babel/types'
import type { UnpluginOptions } from 'unplugin'

const getParentStack = (node: any, result: any[] = []) => {
  if (node?.parent) {
    result.unshift(node.parent.value)
    return getParentStack(node.parent.value, result)
  }
  return result
}

export function transformReactivityFunction(
  code: string,
  ignore: string[],
  s: MagicStringAST,
) {
  const program = babelParse(code, 'tsx')
  let scope = program as Node
  let prevScope: Node | undefined

  const knownMap = new Map<Node, Set<string>>()
  const knownIds: Record<string, number> = Object.create(null)
  const unRefMap = new Map<Node, Set<string>>()
  const unRefIds: Record<string, number> = Object.create(null)

  const refs: Identifier[] = []
  let index = 0

  function isUnRefCallee(calleeName: string) {
    if (
      calleeName === '$' ||
      new RegExp(`^\\$(?!(\\$|${ignore.join('|')})?$)`).test(calleeName)
    ) {
      return true
    }
  }

  function markScopeIdentifier(node: Node, child: Identifier) {
    const { name } = child
    if (name in knownIds) {
      knownIds[name]++
    } else {
      knownIds[name] = 1
    }
    ;(knownMap.get(node) || knownMap.set(node, new Set()).get(node))!.add(name)
  }

  function markUnRefIdentifier(child: Identifier | JSXIdentifier) {
    const { name } = child
    if (name in unRefIds) {
      unRefIds[name]++
    } else {
      unRefIds[name] = 1
    }
    ;(unRefMap.get(scope) || unRefMap.set(scope, new Set()).get(scope))!.add(
      name,
    )
  }

  function walkBlockDeclarations(
    block: BlockStatement | Program,
    onIdent: (node: Identifier) => void,
  ): void {
    for (const stmt of block.body) {
      if (stmt.type === 'VariableDeclaration') {
        if (stmt.declare) continue
        for (const decl of stmt.declarations) {
          const init =
            decl.init?.type === 'TSNonNullExpression'
              ? decl.init.expression
              : decl.init
          if (
            init?.type !== 'CallExpression' ||
            !isUnRefCallee(s.slice(init.callee.start!, init.callee.end!))
          ) {
            for (const id of extractIdentifiers(decl.id)) {
              onIdent(id)
            }
          }
        }
      } else if (
        stmt.type === 'FunctionDeclaration' ||
        stmt.type === 'ClassDeclaration'
      ) {
        if (stmt.declare || !stmt.id) continue
        onIdent(stmt.id)
      } else if (isForStatement(stmt)) {
        walkForStatement(stmt, true, onIdent)
      }
    }
  }

  walk<Node>(program, {
    enter(node, parent) {
      // @ts-ignore
      node.parent = { value: parent }
      if (node.type === 'TSNonNullExpression') {
        node = node.expression
      }

      if (node.type === 'CallExpression') {
        const calleeName = s.slice(node.callee.start!, node.callee.end!)

        if (calleeName === '$$') {
          node.arguments[0].type === 'Identifier' &&
            refs.push(node.arguments[0])
          s.remove(node.callee.start!, node.callee.end!)
        } else if (
          parent?.type === 'VariableDeclarator' &&
          isUnRefCallee(calleeName)
        ) {
          if (parent.id.type === 'Identifier') {
            markUnRefIdentifier(parent.id)
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
            const destructors: string[] = []
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
                  parent.end!,
                  `\n,${prop.argument.name} = ${createPropsRestProxy}(${refName}, [${destructors.join(', ')}])${
                    parent.id.type === 'ArrayPattern' ? ')' : ''
                  }`,
                )
                continue
              }
              const propKey =
                isObjectPattern &&
                prop.type === 'ObjectProperty' &&
                prop.key.type === 'Identifier'
                  ? prop.key.name
                  : propIndex++
              const propValue =
                isObjectPattern && prop.type === 'ObjectProperty'
                  ? prop.value
                  : prop
              const aliasKey =
                propValue.type === 'AssignmentPattern'
                  ? propValue.left
                  : propValue
              const defaultValue =
                propValue.type === 'AssignmentPattern'
                  ? `, ${s.slice(propValue.right.start!, propValue.right.end!)}`
                  : ''
              if (aliasKey.type === 'Identifier') {
                markUnRefIdentifier(aliasKey)
                destructors.push(`'${propKey}'`)
                s.appendLeft(
                  parent.end!,
                  `\n,${aliasKey.name} = ${toRef}(${refName}, '${propKey}'${defaultValue})`,
                )
              }
            }
            s.overwrite(parent.id.start!, parent.id.end!, refName)
          }
          s.remove(node.callee.start!, node.callee.start! + 1)
        }

        if (calleeName.endsWith('$') && !['$', '$$'].includes(calleeName)) {
          s.remove(node.callee.end! - 1, node.callee.end!)

          node.arguments.forEach((argument) => {
            collectRefs(argument, refs)
          })
        }
      } else if (node.type === 'Identifier') {
        const parentStack = getParentStack(node)
        if (
          isReferencedIdentifier(node, parent, parentStack) &&
          !knownIds[node.name] &&
          unRefIds[node.name] &&
          !refs.includes(node) &&
          !isInVSlot(parent!, parentStack.slice(0, -1))
        ) {
          if (parent?.type === 'ObjectProperty' && parent.shorthand) {
            // { foo } => { foo: foo.value }
            s.appendLeft(node.start!, `${node.name}: `)
          }
          s.appendLeft(node.end!, '.value')
        }
      } else if (node.type === 'JSXAttribute') {
        if (
          node.name.type === 'JSXNamespacedName' &&
          node.name.name.name.startsWith('$') &&
          node.name.name.name.endsWith('$')
        ) {
          const name = node.name.name.name.slice(1, -1)
          if (!knownIds[name] && unRefIds[name]) {
            s.appendLeft(node.name.end! - 1, '_value')
          }
        } else if (
          node.value?.type === 'JSXExpressionContainer' &&
          node.name.type === 'JSXIdentifier' &&
          node.name.name.endsWith('$')
        ) {
          s.remove(node.name.end! - 1, node.name.end!)
          if (node.value.expression) {
            collectRefs(node.value.expression, refs)
          }
        }
      } else if (isFunctionType(node)) {
        // walk function expressions and add its arguments to known identifiers
        // so that we don't prefix them
        walkFunctionParams(node, (id) => markScopeIdentifier(node, id))

        if (
          node.type === 'FunctionDeclaration' &&
          node.id?.type === 'Identifier' &&
          node.id.name.endsWith('$')
        ) {
          transformFunctionReturn(node, refs)
          s.remove(node.id.end! - 1, node.id.end!)
        } else if (
          node.type === 'ArrowFunctionExpression' &&
          parent?.type === 'VariableDeclarator' &&
          parent.id?.type === 'Identifier' &&
          parent.id.name.endsWith('$')
        ) {
          transformFunctionReturn(node, refs)
          s.remove(parent.id.end! - 1, parent.id.end!)
        }
      } else if (node.type === 'BlockStatement') {
        scope = node
        walkBlockDeclarations(node, (id) => markScopeIdentifier(node, id))
      } else if (node.type === 'CatchClause' && node.param) {
        for (const id of extractIdentifiers(node.param)) {
          markScopeIdentifier(node, id)
        }
      } else if (isForStatement(node)) {
        walkForStatement(node, false, (id) => markScopeIdentifier(node, id))
      }
    },
    leave(node) {
      if (node.type === 'BlockStatement') {
        scope = prevScope ?? program
      }

      if (
        node !==
        (program.body[0].type === 'ExpressionStatement' &&
          program.body[0].expression)
      ) {
        if (knownMap.get(node)) {
          for (const id of knownMap.get(node)!) {
            knownIds[id]--
            if (knownIds[id] === 0) {
              delete knownIds[id]
            }
          }
          knownMap.delete(node)
        }

        if (unRefMap.get(node)) {
          for (const id of unRefMap.get(node)!) {
            unRefIds[id]--
            if (unRefIds[id] === 0) {
              delete unRefIds[id]
            }
          }
          unRefMap.delete(node)
        }
      }
    },
  })
}

function walkForStatement(
  stmt: ForStatement | ForOfStatement | ForInStatement,
  isVar: boolean,
  onIdent: (id: Identifier) => void,
) {
  const variable = stmt.type === 'ForStatement' ? stmt.init : stmt.left
  if (
    variable &&
    variable.type === 'VariableDeclaration' &&
    (variable.kind === 'var' ? isVar : !isVar)
  ) {
    for (const decl of variable.declarations) {
      for (const id of extractIdentifiers(decl.id)) {
        onIdent(id)
      }
    }
  }
}

export function collectRefs(argument: Node, refs: Node[], visiter = true) {
  if (argument.type === 'Identifier') {
    refs.push(argument)
  } else if (argument.type === 'CallExpression') {
    refs.push(argument.callee)
  } else if (argument.type === 'MemberExpression') {
    refs.push(argument.object)
  } else if (
    argument.type === 'FunctionExpression' ||
    argument.type === 'ArrowFunctionExpression'
  ) {
    transformFunctionReturn(argument, refs)
  } else if (argument.type === 'ArrayExpression') {
    argument.elements.forEach((arg) => {
      collectRefs(arg!, refs)
    })
  } else if (argument.type === 'ObjectExpression') {
    argument.properties.forEach((prop) => {
      if (prop.type === 'ObjectProperty') {
        collectRefs(prop.value, refs)
      }
    })
  } else if (visiter) {
    // @ts-ignore
    walk(argument, {
      enter(node: Node) {
        collectRefs(node, refs, false)
      },
    })
  }
}

export function transformFunctionReturn(node: Node, refs: Node[]) {
  if (
    (node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression') &&
    node.body
  ) {
    if (node.body.type !== 'BlockStatement') {
      collectRefs(node.body, refs)
    } else {
      node.body.body?.forEach((statement) => {
        if (statement.type === 'ReturnStatement' && statement.argument) {
          collectRefs(statement.argument, refs)
        }
      })
    }
  }
}

export function isInVSlot(node: Node, parentStack: Node[]): boolean {
  const parent = parentStack.pop()
  return (
    (node?.type === 'JSXAttribute' &&
      (node.name.type === 'JSXIdentifier'
        ? node.name.name
        : node.name.type === 'JSXNamespacedName'
          ? node.name.namespace.name
          : '') === 'v-slot') ||
    !!(parent && isInVSlot(parent, parentStack))
  )
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
    async transform(code, id) {
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
        await transformReactivityFunction(text, options.ignore, s)
      }

      return generateTransform(s, id)
    },
  }
}
export default plugin
