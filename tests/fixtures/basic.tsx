import { Ref, ref, watch } from 'vue'

function useApi$(defaultName = ref('')) {
  const id = $ref(1)
  const name = $ref(defaultName)
  return {
    id,
    name,
  }
}

let { id: id1 = 0, name, ...rest1 } = $useApi()!
id1 == 0
console.log({
  id1,
  name,
  rest1,
})
useApi$(name)

function useArray$() {
  const foo = $ref(1)
  const bar = $ref(2)
  ;[$$(foo), $$(bar)]
  return [foo, bar]
}

let [foo = 0] = $useArray()
foo === 1
foo = 1

// @ts-expect-error
console.log($useApi())
console.log$(name)

watch$(name, () => {
  let name = 1
  return {
    name,
  }
})

defineExpose$({
  name,
})
const title = $ref<string>('title')
console.log($$(title))
const Comp = ({ title }: { title: Ref<string>; foo: string }) => title.value
export default () => (
  <Comp v-model={title} title$={title} foo={title} v-slot:$title$={{ title }}>
    {title}
  </Comp>
)

for (let title = 0; title < 10; title++) {
  let title1 = $ref('')
  ;[title, title1]
}
// @ts-ignore
;[title1]

// @ts-ignore
defineExpose$({ reload, container: containerRef })
