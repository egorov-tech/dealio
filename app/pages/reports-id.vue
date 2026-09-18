<script setup lang="ts">
import {fetchReportsId} from '~/utils/erp-sheets'
import type {ErpIdRow} from '~/utils/erp-api'
import {groupIdByContract, splitContractTitle} from '~/utils/erp-ks-id-grouping'

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

const groups = computed(() => groupIdByContract(rows.value).map(group => ({
  ...group,
  title: splitContractTitle(group.contract),
})))
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
          <strong class="id-group__code">{{ group.title.code }}</strong>
          <p v-if="group.title.customer" class="id-group__customer">{{ group.title.customer }}</p>
        </header>

        <div class="id-group__grid" role="table" :aria-label="`ИД по договору ${group.contract}`">
          <div class="id-group__grid-head" role="row">
            <span role="columnheader">Статус</span>
            <span role="columnheader">Площадь</span>
            <span role="columnheader">Стоимость с НДС</span>
          </div>
          <div v-for="(line, index) in group.rows" :key="`${line.status}-${index}`" class="id-group__grid-row" role="row">
            <span class="id-group__status" role="cell">
              <ErpStatusBadge :status="line.status" layout="row"/>
            </span>
            <span class="id-group__area" role="cell" data-label="Площадь, м²">{{ formatArea(line.area) }}</span>
            <span class="id-group__amount" role="cell" data-label="С НДС, ₽">{{ formatAmount(line.amountWithVat) }}</span>
          </div>
        </div>
      </article>
    </div>
  </ErpScreen>
</template>

<style scoped lang="sass">
.id-groups
  display: grid
  gap: 12px

.id-group
  display: grid
  gap: 0
  padding: 0
  overflow: hidden
  border-radius: 14px
  border: 0.5px solid rgba(60, 60, 67, 0.12)
  background: #fff
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04)

.id-group__head
  display: grid
  gap: 2px
  padding: 14px 16px 12px
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.1)

.id-group__code
  margin: 0
  font-size: 17px
  font-weight: 700
  letter-spacing: -0.01em
  color: var(--color-text)

.id-group__customer
  margin: 0
  font-size: 13px
  line-height: 1.3
  color: var(--color-text-secondary)

.id-group__grid
  display: grid
  gap: 0
  padding: 4px 16px 8px

.id-group__grid-head,
.id-group__grid-row
  display: grid
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.65fr) minmax(0, 1fr)
  gap: 8px
  align-items: center

.id-group__grid-head
  padding: 8px 0
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.1)
  font-size: 11px
  font-weight: 600
  color: var(--color-text-secondary)

  span:not(:first-child)
    text-align: right

.id-group__grid-row
  padding: 12px 0
  font-size: 13px
  color: var(--color-text)
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.08)

  &:last-child
    border-bottom: 0

.id-group__status
  min-width: 0

.id-group__area,
.id-group__amount
  text-align: right
  white-space: nowrap
  font-variant-numeric: tabular-nums
  font-weight: 600

@media (max-width: 600px)
  .id-group__grid
    padding: 2px 14px 6px

  .id-group__grid-head
    display: none

  .id-group__grid-row
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)
    grid-template-areas: "status status" "area amount"
    gap: 8px 16px
    align-items: end
    padding: 14px 0

  .id-group__status
    grid-area: status

  .id-group__area
    grid-area: area

  .id-group__amount
    grid-area: amount

  .id-group__area,
  .id-group__amount
    text-align: left
    font-size: 16px
    font-weight: 600
    letter-spacing: -0.01em
    line-height: 1.2

  .id-group__amount
    text-align: right

  .id-group__grid-row [data-label]::before
    display: block
    margin-bottom: 4px
    color: var(--color-text-secondary)
    content: attr(data-label)
    font-size: 11px
    font-weight: 500
    line-height: 1.2
    letter-spacing: 0

@media (max-width: 360px)
  .id-group__grid-row
    gap: 8px 12px

  .id-group__area,
  .id-group__amount
    font-size: 15px
</style>
