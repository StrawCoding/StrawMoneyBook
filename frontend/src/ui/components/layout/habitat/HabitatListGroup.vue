<template>
  <div class="habitat-list-group" :data-testid="testId || undefined">
    <slot />
  </div>
</template>

<script setup>
defineProps({
  testId: {
    type: String,
    default: '',
  },
})
</script>
