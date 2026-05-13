import type { Component } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import FeaturesView from '../views/FeaturesView.vue'
import SettingsView from '../views/SettingsView.vue'
import FileView from '../views/FileView.vue'
import MainLayout from '../layouts/MainLayout.vue'
import OnboardingWizard from '../components/OnboardingWizard.vue'

declare module 'vue-router' {
  interface RouteMeta {
    layout?: Component
  }
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { layout: MainLayout } },
    { path: '/features', name: 'features', component: FeaturesView, meta: { layout: MainLayout } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { layout: MainLayout } },
    { path: '/file/:filePath(.*)', name: 'file', component: FileView, meta: { layout: MainLayout } },
    { path: '/onboarding', name: 'onboarding', component: OnboardingWizard },
  ],
})
