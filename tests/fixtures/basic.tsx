import { Ref, ref, watch } from 'vue'

function useApi(defaultName = ref('')) {
  const id = ref(1)
  const name = ref(defaultName)
  return {
    id,
    name,
  }
}

function useArray$() {
  const foo = $ref(1)
  const bar = $ref(2) 
  ;[$$(foo),$$(bar)]
  return [foo, bar]
}
const useArray1$ = () => {
  const foo = $ref(1)
  const bar = $ref(2) 
  ;[$$(foo),$$(bar)]
  return [foo, bar]
}
useArray1()

const [foo = 0, ...rest] = $useArray()
foo === 1  
;[rest]

let { id: id1 = 0, name, ...rest1 } = $useApi();
;id1 == 0
;[rest1]
useApi$(name)

// @ts-expect-error
console.log($useApi())
console.log$(name)

watch$(name, () => {
  let name = 1
  return {
    name
  }
})

defineExpose$({
  name: name.value,
})    
const title = $ref<string>('title')  
console.log($$(title))
const Comp = ({ title }: { title: Ref<string>, foo: string }) => title.value
export default () => <Comp title$={title} foo={title}>{title}</Comp>
