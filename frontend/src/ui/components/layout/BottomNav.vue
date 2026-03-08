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
  z-index: 40;
  will-change: transform, opacity;
}
.nav-item {
  width: 100%;
  padding: 10px;
  align-items: center;
  justify-content: center;
  display: flex;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--anim-fast) var(--anim-standard),
    background-color var(--anim-mid) var(--anim-standard);
}
.nav-item:active {
  transform: translate3d(0, -1px, 0) scale(0.985);
}
.nav-icon {
  width: 35px;
  font-size: 25px;
  color: var(--menu-text, var(--muted));
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--anim-mid) var(--anim-spring),
    color var(--anim-fast) var(--anim-standard),
    opacity var(--anim-fast) var(--anim-standard);
  transform: translate3d(0, 0, 0) scale(1);
  opacity: 0.88;
  will-change: transform, opacity;
}
.nav-item.active .nav-icon {
  color: var(--page-now, var(--primary));
  transform: translate3d(0, -2px, 0) scale(1.04);
  opacity: 1;
}</style>
