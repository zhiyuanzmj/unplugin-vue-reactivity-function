import type { Reference, Scope } from '@typescript-eslint/scope-manager'
import type { TSESTree } from '@typescript-eslint/typescript-estree'

export function getReferences(
  scope: Scope,
  id: TSESTree.Identifier,
): Reference[] {
  return scope.childScopes.reduce(
    (acc, scope) => (acc.push(...getReferences(scope, id)), acc),
    scope.references.filter(
      (ref) => ref.identifier !== id && ref.resolved?.identifiers.includes(id),
    ),
  )
}

export function getMemberExpression(node: TSESTree.Node) {
  if (!node.parent) return node
  if (
    node.parent.type === 'MemberExpression' ||
    node.parent.type === 'ChainExpression' ||
    (node.parent.type === 'CallExpression' && node.parent?.callee === node)
  ) {
    return getMemberExpression(node.parent)
  }
  return node
}

export function transformArguments(
  argument: TSESTree.Node,
  refs: TSESTree.Node[],
) {
  if (
    [
      'Identifier',
      'CallExpression',
      'MemberExpression',
      'ChainExpression',
      'TSInstantiationExpression',
    ].includes(argument.type)
  ) {
    refs.push(argument)
  } else if (
    argument.type === 'FunctionExpression' ||
    argument.type === 'ArrowFunctionExpression'
  ) {
    transformFunctionReturn(argument, refs)
  } else if (argument.type === 'ArrayExpression') {
    argument.elements.forEach((arg) => {
      transformArguments(arg!, refs)
    })
  } else if (argument.type === 'ObjectExpression') {
    argument.properties.forEach((prop) => {
      if (prop.type === 'Property') {
        transformArguments(prop.value, refs)
      }
    })
  }
}

export function transformFunctionReturn(
  node: TSESTree.Node,
  refs: TSESTree.Node[],
) {
  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  ) {
    if (node.body.type !== 'BlockStatement') {
      transformArguments(node.body, refs)
    } else {
      node.body.body?.forEach((statement) => {
        if (statement.type === 'ReturnStatement' && statement.argument) {
          transformArguments(statement.argument, refs)
        }
      })
    }
  }
}
