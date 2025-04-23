import { getReferences } from '../core/utils'
import type { RuleModule } from '@typescript-eslint/utils/ts-eslint'

export interface ReactivityFunctionSchema0 {
  include?: string[]
  exclude?: string[]
}

export type ReactivityFunctionRuleOptions = [ReactivityFunctionSchema0]

export type RuleOptions = ReactivityFunctionRuleOptions
export type MessageIds = 'reactivity-function'

const include = [
  'ref',
  'shallowRef',
  'computed',
  'toRef',
  'toRefs',
  'customRef',
  'useRef',
  'useTemplateRef',
]

const exclude = ['useRoute', 'useRouter']

const rule: RuleModule<MessageIds, RuleOptions> = {
  defaultOptions: [
    {
      include,
      exclude,
    },
  ],
  meta: {
    type: 'layout',
    fixable: 'code',
    messages: {
      'reactivity-function': 'covert to reactivity function',
    },
    schema: [
      {
        type: 'object',
        properties: {
          tabWidth: {
            type: 'array',
          },
        },
      },
    ],
  },
  create(context) {
    const includes = context.options[0]?.include ?? include
    const excludes = context.options[0]?.exclude ?? exclude
    return {
      VariableDeclarator(node) {
        if (node.init?.type !== 'CallExpression' || !node.id) return
        const { id, init } = node
        if (
          init.callee.type === 'Identifier' &&
          !excludes.includes(init.callee.name) &&
          includes?.includes(init.callee.name)
        ) {
          context.report({
            node: init.callee,
            messageId: 'reactivity-function',
            fix(fixer) {
              return fixer.insertTextBefore(init, '$')
            },
          })
          if (node.parent.kind === 'const') {
            context.report({
              node: node.parent,
              messageId: 'reactivity-function',
              fix(fixer) {
                return fixer.replaceTextRange(
                  [node.parent.range[0], node.parent.range[0] + 5],
                  'let',
                )
              },
            })
          }

          const ids =
            id.type === 'Identifier'
              ? [id]
              : id.type === 'ObjectPattern'
                ? id.properties.map((i) =>
                    i.value?.type === 'AssignmentPattern'
                      ? i.value.left
                      : i.value,
                  )
                : id.type === 'ArrayPattern'
                  ? id.elements.map((i) => i)
                  : []
          for (const id of ids) {
            if (!id) continue
            const references = getReferences(
              context.sourceCode.getScope(id),
              id as any,
            )
            references.forEach(({ identifier }) => {
              const { parent } = identifier
              if (
                parent.type === 'MemberExpression' &&
                parent.property.type === 'Identifier' &&
                parent.property.name === 'value'
              ) {
                context.report({
                  node: parent.property,
                  messageId: 'reactivity-function',
                  fix(fixer) {
                    return fixer.removeRange([
                      identifier.range[1],
                      parent.range[1],
                    ])
                  },
                })
              } else if (
                parent.type === 'CallExpression' &&
                parent.callee !== identifier &&
                parent.callee.type === 'Identifier'
              ) {
                if (parent.callee.name.endsWith('$')) return
                context.report({
                  node: parent.callee,
                  messageId: 'reactivity-function',
                  fix(fixer) {
                    return fixer.insertTextAfter(parent.callee, '$')
                  },
                })
              } else if (
                parent.type === 'JSXExpressionContainer' &&
                parent.parent.type === 'JSXAttribute' &&
                parent.parent.name.type === 'JSXIdentifier'
              ) {
                if (parent.parent.name.name.endsWith('$')) return
                const parentName = parent.parent.name
                context.report({
                  node: parentName,
                  messageId: 'reactivity-function',
                  fix(fixer) {
                    return fixer.insertTextAfter(parentName, '$')
                  },
                })
              } else if (
                parent.type === 'CallExpression'
                  ? parent.callee.type === 'Identifier' &&
                    parent.callee.name !== '$$'
                  : true
              ) {
                context.report({
                  node: identifier,
                  messageId: 'reactivity-function',
                  fix(fixer) {
                    return [
                      fixer.insertTextBefore(
                        identifier,
                        `${parent.type === 'Property' && parent.shorthand ? `${identifier.name}: ` : ''}$$(`,
                      ),
                      fixer.insertTextAfter(identifier, ')'),
                    ]
                  },
                })
              }
            })
          }
        }
      },
    }
  },
}

export default rule
