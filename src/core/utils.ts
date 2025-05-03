/* eslint-disable node/prefer-global/process */
import { walk } from 'estree-walker'
import type { Reference, Scope } from '@typescript-eslint/scope-manager'
import type { Node } from 'oxc-parser'

export function getReferences(scope: Scope, id: Node): Reference[] {
  return scope.childScopes.reduce(
    (acc, scope) => (acc.push(...getReferences(scope, id)), acc),
    scope.references.filter(
      // @ts-ignore
      (ref) => ref.identifier !== id && ref.resolved?.identifiers.includes(id),
    ),
  )
}

export function collectRefs(argument: Node, refs: Node[], visiter = true) {
  if (argument.type === 'ChainExpression') {
    argument = argument.expression
  }
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
      if (prop.type === 'Property') {
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

let require: NodeJS.Require | undefined
export function getRequire() {
  if (require) return require

  try {
    // @ts-expect-error check api
    if (globalThis.process?.getBuiltinModule) {
      const module = process.getBuiltinModule('node:module')
      // unenv has implemented `getBuiltinModule` but has yet to support `module.createRequire`
      if (module?.createRequire) {
        return (require = module.createRequire(import.meta.url))
      }
    }
  } catch {}
}

let parseSync: typeof import('oxc-parser').parseSync
export async function getOxcParser() {
  if (!parseSync) {
    parseSync = await import(
      // @ts-ignore
      typeof window !== 'undefined'
        ? 'https://cdn.jsdelivr.net/npm/@oxc-parser/binding-wasm32-wasi/browser-bundle.mjs'
        : 'oxc-parser'
    ).then((mod) => mod.parseSync)
  }
  return parseSync
}
