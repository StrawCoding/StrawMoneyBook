<template>
  <HabitatPageShell
    :title="t('settings_wear_companion.title')"
    :kicker="t('settings_wear_companion.habitat_hello')"
    test-id="settings-wear-view"
    back-to="/settings"
    stack-class="settings-subpage"
  >
    <article class="card panel" data-testid="wear-companion-status">
      <h3>{{ t('settings_wear_companion.status_title') }}</h3>
      <p class="muted compact">{{ t('settings_wear_companion.status_desc') }}</p>

      <ul class="status-list">
        <li class="status-row" data-testid="wear-status-platform">
          <span>{{ t('settings_wear_companion.platform') }}</span>
          <strong :data-ok="status.supported ? '1' : '0'">
            {{ status.supported ? t('settings_wear_companion.android_ok') : t('settings_wear_companion.android_only') }}
          </strong>
        </li>
        <li class="status-row" data-testid="wear-status-nearby">
          <span>{{ t('settings_wear_companion.nearby') }}</span>
          <strong :data-ok="status.nearby ? '1' : '0'">
            {{ status.nearby ? t('settings_wear_companion.nearby_yes') : t('settings_wear_companion.nearby_no') }}
          </strong>
        </li>
        <li class="status-row" data-testid="wear-status-ledger">
          <span>{{ t('settings_wear_companion.active_ledger') }}</span>
          <strong>{{ status.activeLedgerId || t('settings_wear_companion.none') }}</strong>
        </li>
        <li class="status-row" data-testid="wear-status-snapshot">
          <span>{{ t('settings_wear_companion.snapshot_revision') }}</span>
          <strong>{{ status.snapshotRevision }}</strong>
        </li>
        <li class="status-row" data-testid="wear-status-epoch">
          <span>{{ t('settings_wear_companion.sync_epoch') }}</span>
          <code class="epoch">{{ status.syncEpoch || t('settings_wear_companion.none') }}</code>
        </li>
      </ul>

      <p v-if="!status.supported" class="muted warning-text" data-testid="wear-empty-web">
        {{ t('settings_wear_companion.web_empty') }}
      </p>
      <p v-else-if="!status.nearby" class="muted warning-text" data-testid="wear-empty-nearby">
        {{ t('settings_wear_companion.need_nearby') }}
      </p>

      <div class="nodes" data-testid="wear-node-list">
        <h4>{{ t('settings_wear_companion.nodes_title') }}</h4>
        <p v-if="!status.nodes.length" class="muted compact">{{ t('settings_wear_companion.nodes_empty') }}</p>
        <ul v-else>
          <li v-for="node in status.nodes" :key="node.id" class="node-row">
            <span>{{ node.displayName || node.id }}</span>
            <strong>{{ node.nearby ? t('settings_wear_companion.nearby_yes') : t('settings_wear_companion.nearby_no') }}</strong>
          </li>
        </ul>
      </div>

      <div class="row action-row">
        <button class="btn primary" type="button" data-testid="wear-refresh" @click="refresh">
          {{ t('settings_wear_companion.refresh') }}
        </button>
      </div>
      <p v-if="status.error || status.dbError" class="muted warning-text">
        {{ status.error || status.dbError }}
      </p>
    </article>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { onMounted, reactive } from 'vue'
import { useI18n } from '@/ui/services/i18n.service'
import { getWearConnectionStatus } from '@/ui/services/wear-companion.service'

const { t } = useI18n()
const status = reactive({
  supported: false,
  nearby: false,
  nodes: [],
  syncEpoch: '',
  snapshotRevision: 0,
  catalogRevision: 0,
  activeLedgerId: '',
  error: null,
  dbError: null,
})

async function refresh() {
  const next = await getWearConnectionStatus()
  Object.assign(status, next)
}

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.panel {
  padding: 14px;
}
.status-list,
.nodes ul {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.status-row,
.node-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--surface-soft-accent);
}
.epoch {
  font-size: 12px;
  word-break: break-all;
}
.warning-text {
  margin-top: 10px;
  color: var(--warning, #b45309);
}
.action-row {
  margin-top: 14px;
}
.nodes {
  margin-top: 16px;
}
.nodes h4 {
  margin: 0 0 8px;
  font-size: 14px;
}
.muted.compact {
  margin: 6px 0 0;
}
</style>
