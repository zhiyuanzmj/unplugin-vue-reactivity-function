import { defineStore } from 'pinia'
import { ref } from 'vue'

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
