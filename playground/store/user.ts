import { defineStore } from 'pinia'

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
