<template>
  <nav class="bottom-nav" :class="{ modern: isModern }" data-testid="bottom-nav">
    <template v-for="item in items" :key="item.key">
      <RouterLink
        v-if="!item.isCta"
        :to="item.to"
        class="nav-item"
        :class="{ active: item.key === activeTab }"
        :aria-label="item.label"
        :title="item.label"
        :data-testid="`bottom-nav-${item.key}`"
      >
        <span class="nav-pill">
          <font-awesome-icon :icon="item.icon" class="nav-icon" />
        </span>
        <span class="nav-label">{{ item.label }}</span>
      </RouterLink>
      <button
        v-else
        type="button"
        class="nav-item nav-cta"
        :class="{ active: item.key === activeTab }"
        :aria-label="item.label"
        :title="item.label"
        data-testid="bottom-nav-bookkeeping-cta"
        @click="openBookkeeping"
      >
        <span class="cta-circle">
          <font-awesome-icon :icon="item.icon" class="nav-icon" />
        </span>
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </template>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiLayout } from '@/ui/composables/useUiLayout'
import { getPreferredBookkeepingPath, isBookkeepingPath } from '@/ui/services/bookkeeping-mode.service'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { isModern } = useUiLayout()

const TRADITIONAL_NAV_ITEMS = [
  { key: 'home', to: '/', labelKey: 'nav.home', icon: 'fa-solid fa-house' },
  { key: 'analysis', to: '/analysis', labelKey: 'nav.analysis', icon: 'fa-solid fa-chart-pie' },
  { key: 'assets', to: '/assets', labelKey: 'nav.assets', icon: 'fa-solid fa-wallet' },
  { key: 'features', to: '/features', labelKey: 'nav.features', icon: 'fa-solid fa-grip' },
  { key: 'settings', to: '/settings', labelKey: 'nav.settings', icon: 'fa-solid fa-gear' },
]

const MODERN_NAV_ITEMS = [
  { key: 'home', to: '/', labelKey: 'nav.home', icon: 'fa-solid fa-house' },
  { key: 'analysis', to: '/analysis', labelKey: 'nav.analysis', icon: 'fa-solid fa-chart-pie' },
  { key: 'bookkeeping', to: getPreferredBookkeepingPath(), labelKey: 'nav.bookkeeping', icon: 'fa-solid fa-plus', isCta: true },
  { key: 'assets', to: '/assets', labelKey: 'nav.assets', icon: 'fa-solid fa-wallet' },
  { key: 'more', to: '/more', labelKey: 'nav.more', icon: 'fa-solid fa-ellipsis' },
]

const items = computed(() => {
  const source = isModern.value ? MODERN_NAV_ITEMS : TRADITIONAL_NAV_ITEMS
  return source.map((item) => ({
    ...item,
    label: t(item.labelKey),
  }))
})

const activeTab = computed(() => {
  if (isModern.value) {
    if (isBookkeepingPath(route.path)) return 'bookkeeping'
    if (route.meta.tab === 'settings' || route.name === 'features' || route.meta.tab === 'more') return 'more'
    return route.meta.tab
  }
  return route.meta.tab
})

function openBookkeeping() {
  void router.push(getPreferredBookkeepingPath()).catch(() => {})
}
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
  background: color-mix(in srgb, var(--bg) 92%, transparent 8%);
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
  border: none;
  background: transparent;
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
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--muted);
  transition: color var(--anim-fast) var(--anim-standard);
  line-height: 1;
}

.nav-item.active .nav-pill {
  background: color-mix(in srgb, var(--primary) 22%, transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--primary) 30%, transparent);
}

.nav-item.active .nav-icon {
  color: var(--primary);
  transform: scale(1.12) translateY(-1px);
}

.nav-item.active .nav-label {
  color: var(--primary-soft);
}

.bottom-nav.modern .nav-cta {
  margin-top: -18px;
}

.cta-circle {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, var(--primary-soft), var(--primary));
  color: var(--primary-contrast);
  box-shadow: var(--shadow-primary-lg);
}

.nav-cta .nav-icon {
  color: var(--primary-contrast);
  font-size: 20px;
}

.nav-cta.active .cta-circle {
  transform: scale(1.04);
}

.nav-cta.active .nav-label {
  color: var(--primary-soft);
}
</style>
