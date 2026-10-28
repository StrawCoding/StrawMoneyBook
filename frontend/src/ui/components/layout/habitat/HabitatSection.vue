<template>
  <section class="habitat-section" :data-testid="testId || undefined">
    <header v-if="title || $slots.title" class="habitat-section-head">
      <slot name="title">
        <h3 class="habitat-section-title">{{ title }}</h3>
      </slot>
    </header>
    <div class="habitat-section-body">
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: '',
  },
  testId: {
    type: String,
    default: '',
  },
})
</script>
