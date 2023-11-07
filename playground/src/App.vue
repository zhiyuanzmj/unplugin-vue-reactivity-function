<script setup lang="ts">
import { computed, inject, toRefs, watch } from 'vue'
import { useBase64 } from '@vueuse/core'
import { useUserStore } from '../store/user'

const { token, login } = $toRefs(useUserStore())
login()

const text = $inject('text', $token)
const { base64 } = $useBase64($text)

const a = $computed(() => 1)
const b = $(computed(() => 1))

watch($base64, () => {
  console.log(base64)
})

const stop = $$watch(base64, () => {
  console.log($base64)
  stop()
})

$$defineExpose({
  base64,
})
</script>

<template>
  <input v-model="text" />
  <div>{{ base64 }}</div>
</template>
