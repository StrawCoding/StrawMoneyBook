<template>
  <nav class="bottom-nav">
    <RouterLink
      v-for="item in items"
      :key="item.key"
      :to="item.to"
      class="nav-item"
      :class="{ active: item.key === activeTab }"
      :aria-label="item.label"
      :title="item.label"
    >
      <span class="nav-pill">
        <font-awesome-icon :icon="item.icon" class="nav-icon" />
      </span>
      <span class="nav-label">{{ item.label }}</span>
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

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: max(var(--safe-area-left), calc((100vw - var(--app-max-width)) / 2));
  right: max(var(--safe-area-right), calc((100vw - var(--app-max-width)) / 2));
  width: auto;
  height: calc(72px + var(--navigation-bar-height));
  display: flex;
  align-items: flex-start;
  justify-content: space-around;
  padding-top: 8px;
  padding-bottom: var(--navigation-bar-height);
  padding-left: 8px;
  padding-right: 8px;
  background: color-mix(in srgb, var(--card-elevated) 88%, transparent 12%);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border-top: 1px solid var(--border);
  z-index: 40;
  will-change: transform, opacity;
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-decoration: none;
  padding: 4px 4px 0;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--anim-fast) var(--anim-standard);
}

.nav-item:active {
  transform: scale(0.92);
}

.nav-pill {
  width: 48px;
  height: 28px;
  border-radius: var(--radius-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color var(--anim-mid) var(--anim-standard),
    transform var(--anim-mid) var(--anim-bounce);
}

.nav-icon {
  font-size: 18px;
  color: var(--muted);
  transition:
    color var(--anim-fast) var(--anim-standard),
    transform var(--anim-mid) var(--anim-bounce);
}

.nav-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--muted);
  transition: color var(--anim-fast) var(--anim-standard);
  line-height: 1;
}

/* Active state */
.nav-item.active .nav-pill {
  background: color-mix(in srgb, var(--primary) 18%, transparent);
}

.nav-item.active .nav-icon {
  color: var(--primary);
  transform: scale(1.1) translateY(-1px);
}

.nav-item.active .nav-label {
  color: var(--primary-soft);
}
</style>
