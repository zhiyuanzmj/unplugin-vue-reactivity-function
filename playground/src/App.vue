<script setup lang="ts">
import { type Ref, inject, ref, toRefs, watch } from 'vue'
import { useBase64 } from '@vueuse/core'
import { useUserStore } from '../store/user'

const { token, login } = $toRefs(useUserStore())
login()

const text = $inject('text', token)
const { base64 } = $useBase64(text)

$watch(base64, () => {
  $console.log(base64)
})

const stop = $$watch(base64, () => {
  $console.log(base64)
})
stop()

$defineExpose({
  base64,
})
</script>

<template>
  <input v-model="text" />
  <div>{{ base64 }}</div>
</template>
