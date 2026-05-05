<template>
  <div class="empty-state" :class="{ 'empty-state--compact': compact }">
    <div v-if="icon" class="empty-state__icon">
      <font-awesome-icon :icon="icon" />
    </div>
    <p v-if="title" class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  icon: { type: [String, Array], default: null },
  title: { type: String, default: null },
  description: { type: String, default: null },
  compact: { type: Boolean, default: false },
})
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 24px;
  text-align: center;
}

.empty-state--compact {
  padding: 20px 16px;
  gap: 6px;
}

.empty-state__icon {
  font-size: 32px;
  color: var(--muted);
  margin-bottom: 4px;
  opacity: 0.7;
}

.empty-state--compact .empty-state__icon {
  font-size: 24px;
}

.empty-state__title {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--text-soft);
}

.empty-state__desc {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--muted);
  line-height: 1.5;
}
</style>
