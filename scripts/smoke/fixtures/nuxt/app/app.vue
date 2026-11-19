<script setup lang="ts">
const { $client } = useNuxtApp()
// One call during SSR, one in the browser
await useAsyncData('ssr-ping', () => $client.ping({ name: 'ssr' }))
const out = ref('')
onMounted(async () => {
  out.value = JSON.stringify(await $client.ping({ name: 'client' }))
})
</script>

<template>
  <pre id="out">{{ out }}</pre>
</template>
