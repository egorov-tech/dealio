<script setup lang="ts">
import {fetchReportsKs} from '~/utils/erp-sheets'
import type {ErpKsRow} from '~/utils/erp-api'
import {groupKsByContract, splitContractTitle} from '~/utils/erp-ks-id-grouping'

definePageMeta({layout: 'erp'})
useSeoMeta({title: 'КС | ERP'})

const rows = ref<ErpKsRow[]>([])
const loading = ref(true)
const error = ref('')

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    rows.value = await fetchReportsKs()
  } catch (loadError) {
    error.value = errorMessage(loadError, 'Не удалось загрузить КС')
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Значения без единиц: в таблице ТЗ суммы стоят голыми числами, единица
// подразумевается заголовком колонки.
const formatAmount = (value: number): string => new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
}).format(value)

const groups = computed(() => groupKsByContract(rows.value).map(group => ({
  ...group,
  title: splitContractTitle(group.contract),
})))
</script>

<template>
  <ErpScreen
      title="КС"
      subtitle="Суммы и статусы по договорам"
      icon="heroicons:document-currency-dollar"
      :shift-link="{to: '/reports', label: 'Назад', icon: 'heroicons:chevron-left', iconSize: 13}"
  >
    <template #actions>
      <UiButton v-if="rows.length > 0 || error" size="sm" variant="inverse" :loading="loading" @click="load">
        Обновить
      </UiButton>
    </template>

    <ErpEmptyState v-if="loading && rows.length === 0" loading>
      Загружаем КС…
    </ErpEmptyState>

    <ErpEmptyState v-else-if="error" error>
      <p>{{ error }}</p>
      <UiButton variant="outline" @click="load">Повторить</UiButton>
    </ErpEmptyState>

    <ErpEmptyState v-else-if="groups.length === 0">
      <p>Пока нет заполненных строк</p>
      <UiButton variant="outline" @click="load">Обновить</UiButton>
    </ErpEmptyState>

    <div v-else class="ks-groups">
      <article v-for="group in groups" :key="group.contract" class="ks-group">
        <header class="ks-group__head">
          <strong class="ks-group__code">{{ group.title.code }}</strong>
          <p v-if="group.title.customer" class="ks-group__customer">{{ group.title.customer }}</p>
        </header>

        <div class="ks-group__grid" role="table" :aria-label="`КС по договору ${group.contract}`">
          <div class="ks-group__grid-head" role="row">
            <span role="columnheader">КС</span>
            <span role="columnheader">Сумма с НДС</span>
            <span role="columnheader">Статус</span>
          </div>
          <div v-for="(line, index) in group.rows" :key="`${line.number}-${index}`" class="ks-group__grid-row" role="row">
            <span class="ks-group__number" role="cell" data-label="КС">{{ line.number }}</span>
            <span class="ks-group__amount" role="cell" data-label="С НДС, ₽">{{ formatAmount(line.amountWithVat) }}</span>
            <span class="ks-group__status" role="cell">
              <ErpStatusBadge :status="line.status" layout="row"/>
            </span>
          </div>
          <div class="ks-group__grid-row ks-group__grid-row--total" role="row">
            <span class="ks-group__number" role="cell">Итого</span>
            <span class="ks-group__amount" role="cell">{{ formatAmount(group.totalAmountWithVat) }}</span>
            <span class="ks-group__status" role="cell"/>
          </div>
        </div>
      </article>
    </div>
  </ErpScreen>
</template>

<style scoped lang="sass">
.ks-groups
  display: grid
  gap: 12px

.ks-group
  display: grid
  gap: 0
  padding: 0
  overflow: hidden
  border-radius: 14px
  border: 0.5px solid rgba(60, 60, 67, 0.12)
  background: #fff
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04)

.ks-group__head
  display: grid
  gap: 2px
  padding: 14px 16px 12px
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.1)

.ks-group__code
  margin: 0
  font-size: 17px
  font-weight: 700
  letter-spacing: -0.01em
  color: var(--color-text)

.ks-group__customer
  margin: 0
  font-size: 13px
  line-height: 1.3
  color: var(--color-text-secondary)

.ks-group__grid
  display: grid
  gap: 0
  padding: 4px 16px 8px

.ks-group__grid-head,
.ks-group__grid-row
  display: grid
  grid-template-columns: minmax(0, 0.6fr) minmax(0, 1fr) minmax(0, 1fr)
  gap: 8px
  align-items: center

.ks-group__grid-head
  padding: 8px 0
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.1)
  font-size: 11px
  font-weight: 600
  color: var(--color-text-secondary)

  span:not(:first-child)
    text-align: right

.ks-group__grid-row
  padding: 12px 0
  font-size: 13px
  color: var(--color-text)
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.08)

.ks-group__number
  min-width: 0

.ks-group__amount
  text-align: right
  white-space: nowrap
  font-variant-numeric: tabular-nums
  font-weight: 600

.ks-group__status
  min-width: 0
  text-align: right

.ks-group__grid-row--total
  margin: 0 -16px -8px
  padding: 12px 16px 14px
  border-bottom: 0
  border-top: 0.5px solid rgba(60, 60, 67, 0.12)
  background: rgba(60, 60, 67, 0.04)
  font-weight: 700

  span
    font-weight: 700

@media (max-width: 600px)
  .ks-group__grid
    padding: 2px 14px 6px

  .ks-group__grid-head
    display: none

  .ks-group__grid-row
    grid-template-columns: minmax(0, 1fr) auto
    grid-template-areas: "number amount" "status status"
    gap: 8px 16px
    align-items: end
    padding: 14px 0

    &--total
      grid-template-areas: "number amount"
      margin: 0 -14px -6px
      padding: 12px 14px 14px
      align-items: baseline

  .ks-group__number
    grid-area: number
    font-size: 16px
    font-weight: 600
    letter-spacing: -0.01em

  .ks-group__amount
    grid-area: amount
    font-size: 16px
    font-weight: 600
    letter-spacing: -0.01em

  .ks-group__status
    grid-area: status
    text-align: left

  .ks-group__grid-row:not(.ks-group__grid-row--total) .ks-group__amount[data-label]::before,
  .ks-group__grid-row:not(.ks-group__grid-row--total) .ks-group__number[data-label]::before
    display: block
    margin-bottom: 4px
    color: var(--color-text-secondary)
    content: attr(data-label)
    font-size: 11px
    font-weight: 500
    line-height: 1.2

  .ks-group__amount[data-label]::before
    text-align: right

@media (max-width: 360px)
  .ks-group__grid-row
    gap: 8px 12px

  .ks-group__number,
  .ks-group__amount
    font-size: 15px
</style>
