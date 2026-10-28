<template>
  <HabitatPageShell
    :title="t('settings_about.title')"
    :kicker="t('settings_about.habitat_hello')"
    test-id="settings-about-view"
    back-to="/settings"
    stack-class="settings-subpage"
  >

    <HabitatSection>
      <p class="muted intro">{{ t('settings_about.subtitle') }}</p>

      <HabitatListGroup>
        <HabitatRow
          v-for="link in contactLinks"
          :key="link.key"
          :href="link.href"
          :target="link.target"
          :rel="link.rel"
          class="link-row"
          interactive
        >
          <span class="icon-wrap">
            <font-awesome-icon :icon="link.icon" />
          </span>
          <span class="content-wrap">
            <span class="label">{{ t(`settings_about.${link.key}`) }}</span>
            <strong>{{ t(`settings_about.${link.key}_value`) }}</strong>
          </span>
          <span class="action">{{ t('settings_about.open') }}</span>
        </HabitatRow>
      </HabitatListGroup>
    </HabitatSection>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import HabitatSection from '@/ui/components/layout/habitat/HabitatSection.vue'
import HabitatListGroup from '@/ui/components/layout/habitat/HabitatListGroup.vue'
import HabitatRow from '@/ui/components/layout/habitat/HabitatRow.vue'
import { computed } from 'vue'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const privacyPolicyUrl = import.meta.env.VITE_PRIVACY_POLICY_URL || 'https://www.strawmb.com/privacy-policy'
const contactLinks = computed(() => [
  {
    key: 'website',
    href: 'https://www.strawmb.com',
    icon: 'fa-solid fa-house',
    target: '_blank',
    rel: 'noopener noreferrer',
  },
  {
    key: 'facebook',
    href: 'https://www.facebook.com/profile.php?id=61586814027482',
    icon: 'fa-brands fa-facebook',
    target: '_blank',
    rel: 'noopener noreferrer',
  },
  {
    key: 'instagram',
    href: 'https://www.instagram.com/strawmoneybook/',
    icon: 'fa-brands fa-instagram',
    target: '_blank',
    rel: 'noopener noreferrer',
  },
  {
    key: 'threads',
    href: 'https://www.threads.com/@strawmoneybook',
    icon: 'fa-brands fa-threads',
    target: '_blank',
    rel: 'noopener noreferrer',
  },
  {
    key: 'email',
    href: 'mailto:service@strawmb.com',
    icon: 'fa-solid fa-paper-plane',
  },
  {
    key: 'privacy_policy',
    href: privacyPolicyUrl,
    icon: 'fa-solid fa-shield-halved',
    target: '_blank',
    rel: 'noopener noreferrer',
  },
])
</script>

<style scoped>
.page-title {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}

.page-header {
  align-items: center;
}

.intro {
  margin: 0 0 2px;
}

.link-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding-top: 10px;
  padding-bottom: 10px;
}

.icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-soft);
  background: color-mix(in srgb, var(--primary) 14%, transparent);
}

.content-wrap {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.label {
  font-size: 12px;
  color: var(--muted);
}

strong {
  overflow-wrap: anywhere;
}

.action {
  font-size: 12px;
  color: var(--primary-soft);
  border: 1px solid color-mix(in srgb, var(--primary) 42%, transparent);
  border-radius: 999px;
  padding: 2px 8px;
}
</style>
