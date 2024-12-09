<script setup lang="tsx">
import { Ref, ref, watch } from 'vue'

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

const title = $ref<string>('title')
const Comp = ({ title }: { title: Ref<string> }) => title.value
const Render = () => <Comp title$={title} />
</script>

<template>
  <Render />
</template>
