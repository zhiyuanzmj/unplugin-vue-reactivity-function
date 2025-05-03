declare module 'estree-walker' {
  export function walk<T>(
    root: T,
    options: {
      enter?: (node: T, parent: T | null) => any
      leave?: (node: T, parent: T | null) => any
      exit?: (node: T) => any
    } & ThisType<{ skip: () => void }>,
  )
}

declare let __BROWSER__: boolean
declare let __ESM__: boolean
