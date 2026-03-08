<template>
  <nav class="bottom-nav card">
    <RouterLink
      v-for="item in items"
      :key="item.key"
      :to="item.to"
      class="nav-item"
      :class="{ active: item.key === activeTab }"
      :aria-label="item.label"
      :title="item.label"
    >
      <font-awesome-icon :icon="item.icon" class="nav-icon" />
    </RouterLink>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'

const route = useRoute()
const { t } = useI18n()

const NAV_ITEMS = [
  { key: 'home', to: '/', labelKey: 'nav.home', icon: 'fa-solid fa-house' },
  { key: 'analysis', to: '/analysis', labelKey: 'nav.analysis', icon: 'fa-solid fa-chart-pie' },
  { key: 'assets', to: '/assets', labelKey: 'nav.assets', icon: 'fa-solid fa-wallet' },
  { key: 'settings', to: '/settings', labelKey: 'nav.settings', icon: 'fa-solid fa-gear' },
]

const items = computed(() =>
  NAV_ITEMS.map((item) => ({
    ...item,
    label: t(item.labelKey),
  })),
)

const activeTab = computed(() => route.meta.tab)
</script>

<style scoped>.bottom-nav {
  position: fixed;
  bottom: 0;
  left: max(var(--safe-area-left), calc((100vw - var(--app-max-width)) / 2));
  right: max(var(--safe-area-right), calc((100vw - var(--app-max-width)) / 2));
  width: auto;
  height: calc(70px + var(--navigation-bar-height));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--navigation-bar-height);
  background-color: var(--menu-bgc, var(--card));
  border-radius: 0;
  z-index: 40
}
.nav-item {
  width: 100%;
  padding: 10px;
  align-items: center;
  justify-content: center;
  display: flex;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 140ms ease, background-color 180ms ease
}
.nav-item:active {
  transform: translateY(-2px) scale(0.97)
}
.nav-icon {
  width: 35px;
  font-size: 25px;
  color: var(--menu-text, var(--muted));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 150ms ease, color 150ms ease, opacity 150ms ease;
  transform: translateY(0) scale(1);
  opacity: 0.85
}
.nav-item.active .nav-icon {
  color: var(--page-now, var(--primary));
  transform: translateY(-4px) scale(1.08);
  opacity: 1
}</style>
