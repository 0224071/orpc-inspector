// For type checking within the package; in a Nuxt project #app is provided by Nuxt
declare module '#app' {
  export * from 'nuxt/app'
}

// Served by the Vite plugin added by the module
declare module 'virtual:orpc-inspector/client' {}
