<script setup lang="ts">
import {fetchReportsId} from '~/utils/erp-sheets'
import type {ErpIdRow} from '~/utils/erp-api'
import {groupIdByContract} from '~/utils/erp-ks-id-grouping'

definePageMeta({layout: 'erp'})
useSeoMeta({title: 'ИД | ERP'})

const rows = ref<ErpIdRow[]>([])
const loading = ref(true)
const error = ref('')

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    rows.value = await fetchReportsId()
  } catch (loadError) {
    error.value = errorMessage(loadError, 'Не удалось загрузить ИД')
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Значения без единиц: в таблице ТЗ и площадь, и стоимость — голые числа.
const formatAmount = (value: number): string => new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
}).format(value)

const formatArea = (value: number): string => new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
}).format(value)

const groups = computed(() => groupIdByContract(rows.value))
</script>

<template>
  <ErpScreen
      title="ИД"
      subtitle="Исполнительная документация"
      icon="heroicons:clipboard-document-check"
      :shift-link="{to: '/reports', label: 'Назад', icon: 'heroicons:chevron-left', iconSize: 13}"
  >
    <template #actions>
      <UiButton v-if="rows.length > 0 || error" size="sm" variant="inverse" :loading="loading" @click="load">
        Обновить
      </UiButton>
    </template>

    <ErpEmptyState v-if="loading && rows.length === 0" loading>
      Загружаем ИД…
    </ErpEmptyState>

    <ErpEmptyState v-else-if="error" error>
      <p>{{ error }}</p>
      <UiButton variant="outline" @click="load">Повторить</UiButton>
    </ErpEmptyState>

    <ErpEmptyState v-else-if="groups.length === 0">
      <p>Пока нет заполненных строк</p>
      <UiButton variant="outline" @click="load">Обновить</UiButton>
    </ErpEmptyState>

    <div v-else class="id-groups">
      <article v-for="group in groups" :key="group.contract" class="id-group">
        <header class="id-group__head">
          <strong>{{ group.contract }}</strong>
        </header>

        <div class="id-group__grid" role="table" :aria-label="`ИД по договору ${group.contract}`">
          <div class="id-group__grid-head" role="row">
            <span role="columnheader">Статус</span>
            <span role="columnheader">Площадь</span>
            <span role="columnheader">Стоимость с НДС</span>
          </div>
          <div v-for="(line, index) in group.rows" :key="`${line.status}-${index}`" class="id-group__grid-row" role="row">
            <span role="cell"><ErpStatusBadge :status="line.status"/></span>
            <span role="cell">{{ formatArea(line.area) }}</span>
            <span role="cell">{{ formatAmount(line.amountWithVat) }}</span>
          </div>
        </div>
      </article>
    </div>
  </ErpScreen>
</template>

<style scoped lang="sass">
.id-groups
  display: grid
  gap: 10px

.id-group
  display: grid
  gap: 14px
  padding: 16px
  border-radius: 16px
  border: 0.5px solid rgba(60, 60, 67, 0.12)
  background: #fff
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06)

.id-group__head strong
  font-size: 16px
  font-weight: 700
  color: var(--color-text)

.id-group__grid
  display: grid
  gap: 0

.id-group__grid-head,
.id-group__grid-row
  display: grid
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.65fr) minmax(0, 1fr)
  gap: 8px
  align-items: baseline

.id-group__grid-head
  padding-bottom: 8px
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.1)
  font-size: 11px
  font-weight: 600
  color: var(--color-text-secondary)

  span:not(:first-child)
    text-align: right

.id-group__grid-row
  padding: 10px 0
  font-size: 13px
  color: var(--color-text)
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.08)

  &:last-child
    border-bottom: 0

  // min-width: 0 оставляем — без него колонка не сожмётся до своей доли и
  // вытолкнет соседние. А overflow-wrap здесь больше нет: колонку занимает
  // плашка статуса, она считает перенос сама, и правило родителя перебивало
  // её по специфичности, разрывая слова посреди («Устранени/е»).
  span:first-child
    min-width: 0

  span:not(:first-child)
    text-align: right
    // Площадь и стоимость не переносим по разрядам: иначе строка станет
    // выше и блоки договоров разъедутся по вертикали.
    white-space: nowrap
    font-variant-numeric: tabular-nums
    font-weight: 600

@media (max-width: 480px)
  .id-group__grid-head,
  .id-group__grid-row
    // Площади бывают дробными («143 868,4») и занимают почти столько же,
    // сколько стоимость: узкая колонка под них наезжала на соседнюю.
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.7fr) minmax(0, 0.95fr)

@media (max-width: 360px)
  .id-group__grid-head,
  .id-group__grid-row
    gap: 6px
    font-size: 11px
</style>
