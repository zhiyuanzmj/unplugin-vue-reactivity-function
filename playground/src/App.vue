<script setup lang="tsx">
import { type Ref, inject, provide, toRefs, watch } from 'vue'
import { useBase64 } from '@vueuse/core'
import { useUserStore } from '../store/user'

const { token, login } = $toRefs(useUserStore())
login()

const text = $inject$('text', token)
const { base64 } = $useBase64$(text)
provide$('base64', base64)

const $fetch = fetch

const stop = watch$(base64, () => {
  $fetch('')
  console.log$(base64)
  stop()
})

defineExpose$({
  base64,
})

const title = $ref('title')
const Comp = ({ title }: { title: Ref<string> }) => <div>{title.value}</div>
const Render = <Comp title$={title} />
</script>

<template>
  <input v-model="text" />
  <div>{{ base64 }}</div>
</template>
