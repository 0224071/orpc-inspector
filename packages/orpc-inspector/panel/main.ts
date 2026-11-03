import { createApp } from 'vue'
import { syncDockColorScheme } from './color-scheme'
import PanelApp from './panel-app.vue'
import './panel.css'

// Before mount, so the first render already uses the dock's theme
syncDockColorScheme()
createApp(PanelApp).mount('#app')
