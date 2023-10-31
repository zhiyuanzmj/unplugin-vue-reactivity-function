<script setup lang="ts">
import { type Ref, inject, ref, watch } from 'vue'
import { useBase64 } from '@vueuse/core'

function logRef(...logs: Ref<any>[]) {
  console.log(logs)
}

const text = $inject('text', ref('vue'))
const { base64 } = $useBase64(text)
$watch(base64, () => {
  $logRef(base64)
})

const stop = $$watch(base64, () => {
  $logRef(base64)
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
