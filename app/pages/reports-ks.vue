<script setup lang="ts">
import {fetchReportsKs} from '~/utils/erp-sheets'
import type {ErpKsRow} from '~/utils/erp-api'
import {groupKsByContract} from '~/utils/erp-ks-id-grouping'

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

const groups = computed(() => groupKsByContract(rows.value))
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
          <strong>{{ group.contract }}</strong>
        </header>

        <div class="ks-group__grid" role="table" :aria-label="`КС по договору ${group.contract}`">
          <div class="ks-group__grid-head" role="row">
            <span role="columnheader">КС</span>
            <span role="columnheader">Сумма с НДС</span>
            <span role="columnheader">Статус</span>
          </div>
          <div v-for="(line, index) in group.rows" :key="`${line.number}-${index}`" class="ks-group__grid-row" role="row">
            <span role="cell">{{ line.number }}</span>
            <span role="cell">{{ formatAmount(line.amountWithVat) }}</span>
            <span role="cell"><ErpStatusBadge :status="line.status"/></span>
          </div>
          <div class="ks-group__grid-row ks-group__grid-row--total" role="row">
            <span role="cell">Итого</span>
            <span role="cell">{{ formatAmount(group.totalAmountWithVat) }}</span>
            <span role="cell"/>
          </div>
        </div>
      </article>
    </div>
  </ErpScreen>
</template>

<style scoped lang="sass">
.ks-groups
  display: grid
  gap: 10px

.ks-group
  display: grid
  gap: 14px
  padding: 16px
  border-radius: 16px
  border: 0.5px solid rgba(60, 60, 67, 0.12)
  background: #fff
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06)

.ks-group__head strong
  font-size: 16px
  font-weight: 700
  color: var(--color-text)

.ks-group__grid
  display: grid
  gap: 0

.ks-group__grid-head,
.ks-group__grid-row
  display: grid
  grid-template-columns: minmax(0, 0.6fr) minmax(0, 1fr) minmax(0, 1fr)
  gap: 8px
  align-items: baseline

.ks-group__grid-head
  padding-bottom: 8px
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.1)
  font-size: 11px
  font-weight: 600
  color: var(--color-text-secondary)

  span:not(:first-child)
    text-align: right

.ks-group__grid-row
  padding: 10px 0
  font-size: 13px
  color: var(--color-text)
  border-bottom: 0.5px solid rgba(60, 60, 67, 0.08)

  span:first-child
    min-width: 0

  span:not(:first-child)
    text-align: right
    font-variant-numeric: tabular-nums
    font-weight: 600

  // Только сумма: статус — текст, ему перенос нужен, иначе «На согласовании»
  // вылезет за край карточки на телефоне.
  span:nth-child(2)
    white-space: nowrap

  &--total
    border-bottom: 0
    border-top: 0.5px solid rgba(60, 60, 67, 0.16)
    font-weight: 700

    span
      font-weight: 700

@media (max-width: 480px)
  .ks-group__grid-head,
  .ks-group__grid-row
    grid-template-columns: minmax(0, 0.5fr) minmax(0, 1fr) minmax(0, 1fr)


// На узких экранах кегль меньше, но колонки те же: сумма в одну строку
// важнее размера шрифта, а перенос сдвинул бы строки соседних блоков.
@media (max-width: 360px)
  .ks-group__grid-head,
  .ks-group__grid-row
    gap: 6px
    font-size: 11px
</style>
