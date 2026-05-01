import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import FeaturesView from '../views/FeaturesView.vue'
import SettingsView from '../views/SettingsView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/features', name: 'features', component: FeaturesView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})
