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

// The chat surface no longer participates in this router. It moved to the
// dedicated `AgentSidepanelView` (`VIEW_TYPE = 'specorator-agent'`,
// IDEA-ASV-001), which mounts its own Vue app outside the tabbed shell.
//
// Codex P2 on PR #369: keep `/chat` as a redirect to `/` so users whose
// previous hash route was `#/chat` (from the legacy in-panel chat tab)
// don't land on an empty `RouterView`. They get the home view; the
// chat sidepanel is one ribbon click / command away.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { layout: MainLayout } },
    { path: '/features', name: 'features', component: FeaturesView, meta: { layout: MainLayout } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { layout: MainLayout } },
    { path: '/file/:filePath(.*)', name: 'file', component: FileView, meta: { layout: MainLayout } },
    { path: '/onboarding', name: 'onboarding', component: OnboardingWizard },
    { path: '/chat', redirect: '/' },
  ],
})
