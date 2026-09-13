<script setup lang="ts">
definePageMeta({layout: 'erp'})
useSeoMeta({title: 'ПТО | ERP'})

// Тот же приём, что у «Отчётов» (app/pages/reports.vue) и «Заявок и счетов»:
// раздел — хаб из плиток, каждая ведёт на свой экран учёта.
const tiles = [
  {
    to: '/pto-ed',
    icon: 'heroicons:clipboard-document-check',
    label: 'ИД',
    caption: 'Исполнительная документация',
    tone: '#7C3AED',
  },
  {
    to: '/pto-ks',
    icon: 'heroicons:document-currency-dollar',
    label: 'КС',
    caption: 'Акты форм КС',
    tone: '#B45309',
  },
  {
    to: '/pto-work-statements',
    icon: 'heroicons:document-text',
    label: 'ВР',
    caption: 'Ведомость работ',
    tone: '#0F766E',
  },
]
</script>

<template>
  <ErpScreen
      title="ПТО"
      subtitle="Проектные данные"
      icon="heroicons:clipboard-document-list"
  >
    <ErpSectionLabel>Разделы</ErpSectionLabel>
    <div class="pto-grid">
      <ErpTile
          v-for="tile in tiles"
          :key="tile.to"
          :to="tile.to"
          :icon="tile.icon"
          :label="tile.label"
          :caption="tile.caption"
          :tone="tile.tone"
      />
    </div>
  </ErpScreen>
</template>

<style scoped lang="sass">
.pto-grid
  display: grid
  grid-template-columns: 1fr 1fr
  gap: var(--spacing-3)
</style>
