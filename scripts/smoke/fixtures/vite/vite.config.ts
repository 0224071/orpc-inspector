import { orpcInspector } from 'orpc-inspector/vite'
import { defineConfig } from 'vite'
import { rpcServer } from './rpc-server'

export default defineConfig({
  // clientAuth: false skips the one-time code so the smoke test can open the dock
  devtools: { enabled: true, clientAuth: false },
  plugins: [
    orpcInspector(),
    rpcServer(),
  ],
})
