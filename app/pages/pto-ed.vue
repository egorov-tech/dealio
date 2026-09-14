<script setup lang="ts">
import {createEdRow, deleteEdRow, fetchEdRows, fetchPtoContracts, updateEdRow} from '~/utils/erp-pto'
import type {ErpEdRow, ErpPtoContract} from '~/utils/erp-pto'
import type {ErpComboboxOption} from '~/components/erp/ErpCombobox.vue'
import {useAppToast} from '~/composables/useAppToast'

definePageMeta({layout: 'erp'})
useSeoMeta({title: 'ИД | ERP'})

const {showSuccess, showError} = useAppToast()

const rows = ref<ErpEdRow[]>([])
const statuses = ref<string[]>([])
const contracts = ref<ErpPtoContract[]>([])
const isLoading = ref(true)
const loadError = ref('')
const isSaving = ref(false)

const contractOptions = computed<ErpComboboxOption[]>(() =>
    contracts.value.map(item => ({value: item.internalNumber, hint: item.customer})),
)
const statusOptions = computed<ErpComboboxOption[]>(() => statuses.value.map(value => ({value})))

const load = async () => {
  isLoading.value = true
  loadError.value = ''
  try {
    const [ed, contractList] = await Promise.all([fetchEdRows(), fetchPtoContracts()])
    rows.value = ed.rows
    statuses.value = ed.statuses
    contracts.value = contractList
  } catch (error) {
    loadError.value = errorMessage(error, 'Не удалось загрузить ИД')
  } finally {
    isLoading.value = false
  }
}
onMounted(load)

// Правка идёт по одной строке: несколько открытых форм на телефоне — это и
// промахи пальцем, и путаница, какую сохранять.
type Draft = {contractInternalNumber: string; aosr: string; title: string; part: string; volume: string; cost: string; status: string}
const emptyDraft = (): Draft => ({contractInternalNumber: '', aosr: '', title: '', part: '', volume: '', cost: '', status: ''})

const editingId = ref<number | null>(null)
const draft = ref<Draft>(emptyDraft())
const editForm = useTemplateRef<HTMLElement[]>('editForm')

const isAdding = ref(false)
const newDraft = ref<Draft>(emptyDraft())

const closeAll = () => {
  editingId.value = null
  isAdding.value = false
}

/** Пустое значение показываем пустым полем, а не нулём: ноль в объёме или
 * стоимости выглядит как настоящее значение, а не как «пока не заполнено». */
const editableNumber = (value: number | null): string => value === null ? '' : String(value).replace('.', ',')

const onRowTap = async (row: ErpEdRow) => {
  if (editingId.value === row.id) {
    editingId.value = null
    return
  }
  isAdding.value = false
  editingId.value = row.id
  draft.value = {
    contractInternalNumber: row.contractInternalNumber,
    aosr: row.aosr,
    title: row.title,
    part: row.part,
    volume: editableNumber(row.volume),
    cost: editableNumber(row.cost),
    status: row.status,
  }
  await nextTick()
  editForm.value[0]?.scrollIntoView({block: 'nearest', behavior: 'smooth'})
}

const startAdding = () => {
  closeAll()
  isAdding.value = true
  newDraft.value = emptyDraft()
}

const validate = (value: Draft): boolean => {
  if (!value.contractInternalNumber.trim()) {
    showError(null, 'Выберите договор')
    return false
  }
  if (!statuses.value.includes(value.status)) {
    showError(null, 'Выберите статус из списка')
    return false
  }
  return true
}

const saveDraft = async (row: ErpEdRow) => {
  if (!validate(draft.value)) return
  isSaving.value = true
  try {
    const saved = await updateEdRow(row.id, {...draft.value})
    Object.assign(row, saved)
    editingId.value = null
    showSuccess('ИД сохранена', saved.title || saved.aosr)
  } catch (error) {
    showError(error, 'Не удалось сохранить запись')
  } finally {
    isSaving.value = false
  }
}

const addRow = async () => {
  if (!validate(newDraft.value)) return
  isSaving.value = true
  try {
    const created = await createEdRow({...newDraft.value})
    rows.value = [created, ...rows.value]
    isAdding.value = false
    showSuccess('ИД добавлена', created.title || created.aosr)
  } catch (error) {
    showError(error, 'Не удалось добавить запись')
  } finally {
    isSaving.value = false
  }
}

const removeRow = async (row: ErpEdRow) => {
  isSaving.value = true
  try {
    await deleteEdRow(row.id)
    rows.value = rows.value.filter(item => item.id !== row.id)
    if (editingId.value === row.id) editingId.value = null
    showSuccess('Запись удалена', row.title || row.aosr)
  } catch (error) {
    showError(error, 'Не удалось удалить запись')
  } finally {
    isSaving.value = false
  }
}

// Значения в закрытой карточке — тоже столбцами, не только в открытой форме:
// сотруднику ПТО нужно сравнивать объём и стоимость между строками, не
// открывая каждую по очереди.
const formatAmount = (value: number | null): string => value === null ? '—' : new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2}).format(value)

const rowMetrics = (row: ErpEdRow) => [
  {label: 'Часть', value: row.part || '—'},
  {label: 'Объём', value: formatAmount(row.volume)},
  {label: 'Стоимость', value: formatAmount(row.cost)},
  {label: 'Статус', value: row.status || '—'},
]
</script>

<template>
  <ErpScreen
      title="ИД"
      subtitle="Исполнительная документация"
      icon="heroicons:clipboard-document-check"
      :shift-link="{to: '/pto', label: 'Назад', icon: 'heroicons:chevron-left', iconSize: 13}"
  >
    <template #actions>
      <UiButton size="sm" variant="inverse" @click="startAdding">Добавить</UiButton>
    </template>

    <ErpEmptyState v-if="isLoading" loading>
      <span>Загрузка…</span>
    </ErpEmptyState>

    <ErpEmptyState v-else-if="loadError" error>
      <p>{{ loadError }}</p>
      <UiButton variant="outline" @click="load">Повторить</UiButton>
    </ErpEmptyState>

    <template v-else>
      <section v-if="isAdding" ref="editForm" class="ed-new">
        <ErpSectionLabel>Новая запись</ErpSectionLabel>
        <label class="ed-field">
          <span class="ed-field__label">Договор</span>
          <ErpCombobox v-model="newDraft.contractInternalNumber" :options="contractOptions" placeholder="Внутренний номер договора"/>
        </label>
        <label class="ed-field">
          <span class="ed-field__label">АОСР</span>
          <input v-model="newDraft.aosr" type="text" class="ed-input">
        </label>
        <label class="ed-field">
          <span class="ed-field__label">Титул</span>
          <input v-model="newDraft.title" type="text" class="ed-input">
        </label>
        <label class="ed-field">
          <span class="ed-field__label">Часть</span>
          <input v-model="newDraft.part" type="text" class="ed-input">
        </label>
        <label class="ed-field">
          <span class="ed-field__label">Объём</span>
          <input v-model="newDraft.volume" type="text" inputmode="decimal" class="ed-input">
        </label>
        <label class="ed-field">
          <span class="ed-field__label">Стоимость</span>
          <input v-model="newDraft.cost" type="text" inputmode="decimal" class="ed-input">
        </label>
        <label class="ed-field">
          <span class="ed-field__label">Статус</span>
          <ErpCombobox v-model="newDraft.status" :options="statusOptions" placeholder="Выберите статус"/>
        </label>
        <div class="ed-new__actions">
          <UiButton :loading="isSaving" @click="addRow">Добавить</UiButton>
          <UiButton variant="outline" @click="isAdding = false">Отмена</UiButton>
        </div>
      </section>

      <ErpEmptyState v-if="rows.length === 0 && !isAdding">
        <p>Пока нет заполненных строк</p>
        <UiButton variant="outline" @click="startAdding">Добавить</UiButton>
      </ErpEmptyState>

      <div v-else class="ed-list">
        <div v-for="row in rows" :key="row.id" class="ed-group">
          <div class="ed-row">
            <button type="button" class="ed-tap" @click="onRowTap(row)">
              <strong class="ed-tap__title">{{ row.title || row.aosr || 'Без названия' }}</strong>
              <p class="ed-tap__meta">
                <span>{{ row.contractInternalNumber }}</span>
                <span v-if="row.title && row.aosr" aria-hidden="true">·</span>
                <span v-if="row.title && row.aosr">{{ row.aosr }}</span>
              </p>
              <dl class="ed-tap__metrics">
                <div v-for="metric in rowMetrics(row)" :key="metric.label" class="ed-tap__metric">
                  <dt>{{ metric.label }}</dt>
                  <dd>{{ metric.value }}</dd>
                </div>
              </dl>
            </button>
            <button
                type="button"
                class="ed-remove"
                :disabled="isSaving"
                aria-label="Удалить запись"
                @click="removeRow(row)"
            >
              <Icon name="heroicons:trash" size="15"/>
            </button>
          </div>

          <div v-if="editingId === row.id" ref="editForm" class="ed-edit">
            <label class="ed-field">
              <span class="ed-field__label">Договор</span>
              <ErpCombobox v-model="draft.contractInternalNumber" :options="contractOptions" placeholder="Внутренний номер договора"/>
            </label>
            <label class="ed-field">
              <span class="ed-field__label">АОСР</span>
              <input v-model="draft.aosr" type="text" class="ed-input">
            </label>
            <label class="ed-field">
              <span class="ed-field__label">Титул</span>
              <input v-model="draft.title" type="text" class="ed-input">
            </label>
            <label class="ed-field">
              <span class="ed-field__label">Часть</span>
              <input v-model="draft.part" type="text" class="ed-input">
            </label>
            <label class="ed-field">
              <span class="ed-field__label">Объём</span>
              <input v-model="draft.volume" type="text" inputmode="decimal" class="ed-input">
            </label>
            <label class="ed-field">
              <span class="ed-field__label">Стоимость</span>
              <input v-model="draft.cost" type="text" inputmode="decimal" class="ed-input">
            </label>
            <label class="ed-field">
              <span class="ed-field__label">Статус</span>
              <ErpCombobox v-model="draft.status" :options="statusOptions" placeholder="Выберите статус"/>
            </label>
            <div class="ed-edit__actions">
              <UiButton :loading="isSaving" @click="saveDraft(row)">Сохранить</UiButton>
              <UiButton variant="outline" @click="editingId = null">Отмена</UiButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </ErpScreen>
</template>

<style scoped lang="sass">
.ed-new, .ed-group
  display: grid
  gap: 10px
  padding: 16px
  border-radius: 16px
  border: 0.5px solid rgba(60, 60, 67, 0.12)
  background: #fff
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06)

.ed-list
  display: grid
  gap: 10px

.ed-row
  display: flex
  align-items: stretch
  gap: 8px

.ed-tap
  flex: 1
  min-width: 0
  display: grid
  gap: 4px
  text-align: left
  background: none
  border: none
  padding: 0
  cursor: pointer

.ed-tap__title
  font-size: 15px
  font-weight: 700
  color: var(--color-text)
  overflow-wrap: anywhere

.ed-tap__meta
  margin: 0
  display: flex
  flex-wrap: wrap
  gap: 6px
  font-size: 12.5px
  color: var(--color-text-secondary)

// Строгие столбцы, а не подпись через запятую: объём и стоимость должны
// стоять на одном месте между карточками, чтобы их можно было сравнить
// взглядом, не открывая каждую запись по очереди.
.ed-tap__metrics
  display: grid
  grid-template-columns: repeat(3, minmax(0, 1fr))
  gap: 8px
  margin: 8px 0 0
  padding-top: 8px
  border-top: 0.5px solid rgba(60, 60, 67, 0.1)

.ed-tap__metric
  min-width: 0
  display: grid
  gap: 2px

  dt
    margin: 0
    font-size: 10.5px
    font-weight: 600
    color: var(--color-text-secondary)

  dd
    margin: 0
    overflow-wrap: anywhere
    font-size: 13px
    font-weight: 700
    color: var(--color-text)
    font-variant-numeric: tabular-nums

@media (max-width: 480px)
  .ed-tap__metrics
    grid-template-columns: 1fr
    gap: 0

  .ed-tap__metric
    grid-template-columns: minmax(0, 1fr) auto
    align-items: baseline
    padding-top: 6px

    dd
      text-align: right

.ed-remove
  flex-shrink: 0
  width: 32px
  display: flex
  align-items: center
  justify-content: center
  border: none
  background: rgba(220, 38, 38, 0.08)
  color: #DC2626
  border-radius: 10px

  &:disabled
    opacity: 0.5

.ed-edit
  display: grid
  gap: 10px
  padding-top: 10px
  border-top: 0.5px solid rgba(60, 60, 67, 0.1)

.ed-field
  display: grid
  gap: 4px

.ed-field__label
  font-size: 11px
  font-weight: 600
  color: var(--color-text-secondary)

.ed-input
  padding: 10px 12px
  border: 0.5px solid rgba(60, 60, 67, 0.16)
  border-radius: 10px
  background: var(--color-card-bg)
  color: var(--color-text)

.ed-new__actions, .ed-edit__actions
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 8px
  margin-top: 4px
</style>
