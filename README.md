# unplugin-vue-reactivity-function [![npm](https://img.shields.io/npm/v/unplugin-vue-reactivity-function.svg)](https://npmjs.com/package/unplugin-vue-reactivity-function)

[![Unit Test](https://github.com/unplugin/unplugin-vue-reactivity-function/actions/workflows/unit-test.yml/badge.svg)](https://github.com/unplugin/unplugin-vue-reactivity-function/actions/workflows/unit-test.yml)

Named export for Vue SFC.

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
  plugins: [VueReactivityFunction()],
})
```

<br></details>

<details>
<summary>Rollup</summary><br>

```ts
// rollup.config.js
import VueReactivityFunction from 'unplugin-vue-reactivity-function/rollup'

export default {
  plugins: [VueReactivityFunction()],
}
```

<br></details>

<details>
<summary>esbuild</summary><br>

```ts
// esbuild.config.js
import { build } from 'esbuild'

build({
  plugins: [require('unplugin-vue-reactivity-function/esbuild')()],
})
```

<br></details>

<details>
<summary>Webpack</summary><br>

```ts
// webpack.config.js
module.exports = {
  /* ... */
  plugins: [require('unplugin-vue-reactivity-function/webpack')()],
}
```

<br></details>

<details>
<summary>Vue CLI</summary><br>

```ts
// vue.config.js
module.exports = {
  configureWebpack: {
    plugins: [require('unplugin-vue-reactivity-function/webpack')()],
  },
}
```

<br></details>

## Usage

```vue
<script setup lang="tsx">
import { useBase64 } from '@vueuse/core'

function log(...logs: Ref<any>[]) {
  console.log(logs)
}

const defaultText = $ref('vue')
const text = $inject('text', defaultText)
// is equivalent to:
const text = $(inject('text', $$(defaultText)))

const { base64 } = $useBase64(text)
// is equivalent to:
const { base64 } = $(useBase64($$(text)))

$watch(base64, () => {
  $log(base64)
})
// is equivalent to:
watch($$(base64), () => {
  log($$(base64))
})

const stop = $$watch(base64, () => {
  $log(base64)
})
// is equivalent to:
const stop = watch($$(base64), () => {
  log($$(base64))
})
stop()

$defineExpose({
  base64,
})
// is equivalent to:
defineExpose({
  base64: $$(base64),
})
</script>
```

### Volar

```jsonc
// tsconfig.json
{
  // ...
  "vueCompilerOptions": {
    "plugins": ["unplugin-vue-reactivity-function/volar"]
  }
}
```

## License

[MIT](./LICENSE) License © 2023-PRESENT [zhiyuanzmj](https://github.com/zhiyuanzmj)
