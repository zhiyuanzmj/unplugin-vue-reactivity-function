# unplugin-vue-reactivity-function [![npm](https://img.shields.io/npm/v/unplugin-vue-reactivity-function.svg)](https://npmjs.com/package/unplugin-vue-reactivity-function)

[![Unit Test](https://github.com/zhiyuanzmj/unplugin-vue-reactivity-function/actions/workflows/unit-test.yml/badge.svg)](https://github.com/zhiyuanzmj/unplugin-vue-reactivity-function/actions/workflows/unit-test.yml)

Reactivity Function.

## Installation

```bash
npm i -D unplugin-vue-reactivity-function
```

<details>
<summary>Vite</summary><br>

```ts
// vite.config.ts
import VueReactivityFunction from 'unplugin-vue-reactivity-function/vite'

export default defineConfig({
  plugins: [
    VueReactivityFunction({
      ignore: ['$fetch'],
    }),
  ],
})
```

<br></details>

<details>
<summary>Rollup</summary><br>

```ts
// rollup.config.js
import VueReactivityFunction from 'unplugin-vue-reactivity-function/rollup'

export default {
  plugins: [
    VueReactivityFunction({
      ignore: ['$fetch'],
    }),
  ],
}
```

<br></details>

<details>
<summary>esbuild</summary><br>

```ts
// esbuild.config.js
import { build } from 'esbuild'

build({
  plugins: [
    require('unplugin-vue-reactivity-function/esbuild')({
      ignore: ['$fetch'],
    }),
  ],
})
```

<br></details>

<details>
<summary>Webpack</summary><br>

```ts
// webpack.config.js
module.exports = {
  /* ... */
  plugins: [
    require('unplugin-vue-reactivity-function/webpack')({
      ignore: ['$fetch'],
    }),
  ],
}
```

<br></details>

<details>
<summary>Vue CLI</summary><br>

```ts
// vue.config.js
module.exports = {
  configureWebpack: {
    plugins: [
      require('unplugin-vue-reactivity-function/webpack')({
        ignore: ['$fetch'],
      }),
    ],
  },
}
```

<br></details>

## Usage

```ts
// ~/store/user.ts
export const useUserStore = defineStore$('user', () => {
  let token = $ref('')
  function login() {
    token = 'TOKEN'
  }

  return {
    token,
    login,
  }
})

// convert to:
export const useUserStore = defineStore('user', () => {
  let token = $ref('')
  function login() {
    token = 'TOKEN'
  }

  return {
    token: $$(token),
    login: $$(login),
  }
})
```

```vue
<script setup lang="tsx">
import { useBase64 } from '@vueuse/core'
import { useUserStore } from '~/store/user'

const { token, login } = $useUserStore()
;[token]
// convert to:
const { token, login } = toRefs(useUserStore())
;[login.value]

const text = $inject$('text', token)
// convert to:
const text = inject('text', token)

const { base64 } = $useBase64$(text)
// convert to:
const { base64 } = useBase64(text)

provide$('base64', base64)
// convert to:
provide('base64', base64)

const stop = watch$(base64, () => {
  console.log(base64)
  console.log$(base64)
  stop()
})
// convert to:
const stop = watch(base64, () => {
  console.log(base64.value)
  console.log(base64)
  stop()
})

defineExpose$({
  base64,
})
// convert to:
defineExpose({
  base64,
})

let compRef = $useRef()
defineRender(<Comp ref$={compRef} />)
// convert to:
let compRef = useRef()
defineRender(<Comp ref={compRef} />)
</script>
```

### Volar Config

```jsonc
// tsconfig.json
{
  // ...
  "vueCompilerOptions": {
    "plugins": ["unplugin-vue-reactivity-function/volar"],
    "reactivityFunction": {
      "ignore": ["$fetch"],
    },
  },
}
```

### [TS Macro](https://github.com/ts-macro/ts-macro) Config

```ts [tsm.config.json]
import reactivityFunction from 'unplugin-vue-reactivity-function/volar'

export default {
  plugins: [
    reactivityFunction({
      ignore: ['$fetch'],
    }),
  ],
}
```

## License

[MIT](./LICENSE) License © 2023-PRESENT [zhiyuanzmj](https://github.com/zhiyuanzmj)
