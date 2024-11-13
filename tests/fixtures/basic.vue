<script setup lang="tsx">
import { ref, watch } from 'vue'

function useApi(defaultName = ref('')) {
  const id = ref(1)
  const name = ref(defaultName)
  return {
    id,
    name,
  }
}

const { id, name } = $useApi()
id === 1
useApi$(name)

// @ts-expect-error
console.log($useApi())

watch$(name, () => {})

defineExpose$({
  name,
})
</script>

<template>
  <div>
    {{ name }}
  </div>
</template>
