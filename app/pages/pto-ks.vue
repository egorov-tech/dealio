<script setup lang="ts">
import {createKsRecordRow, deleteKsRecordRow, fetchKsRecordRows, fetchPtoContracts, updateKsRecordRow} from '~/utils/erp-pto'
import type {ErpKsRecordRow, ErpPtoContract} from '~/utils/erp-pto'
import type {ErpComboboxOption} from '~/components/erp/ErpCombobox.vue'
import {useAppToast} from '~/composables/useAppToast'

definePageMeta({layout: 'erp'})
useSeoMeta({title: 'КС | ERP'})

const {showSuccess, showError} = useAppToast()

const rows = ref<ErpKsRecordRow[]>([])
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
    const [ks, contractList] = await Promise.all([fetchKsRecordRows(), fetchPtoContracts()])
    rows.value = ks.rows
    statuses.value = ks.statuses
    contracts.value = contractList
  } catch (error) {
    loadError.value = errorMessage(error, 'Не удалось загрузить КС')
  } finally {
    isLoading.value = false
  }
}
onMounted(load)

type Draft = {contractInternalNumber: string; number: string; cost: string; status: string}
const emptyDraft = (): Draft => ({contractInternalNumber: '', number: '', cost: '', status: ''})

const editingId = ref<number | null>(null)
const draft = ref<Draft>(emptyDraft())
const editForm = useTemplateRef<HTMLElement[]>('editForm')

const isAdding = ref(false)
const newDraft = ref<Draft>(emptyDraft())

const closeAll = () => {
  editingId.value = null
  isAdding.value = false
}

const editableNumber = (value: number | null): string => value === null ? '' : String(value).replace('.', ',')

const onRowTap = async (row: ErpKsRecordRow) => {
  if (editingId.value === row.id) {
    editingId.value = null
    return
  }
  isAdding.value = false
  editingId.value = row.id
  draft.value = {
    contractInternalNumber: row.contractInternalNumber,
    number: row.number,
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

const saveDraft = async (row: ErpKsRecordRow) => {
  if (!validate(draft.value)) return
  isSaving.value = true
  try {
    const saved = await updateKsRecordRow(row.id, {...draft.value})
    Object.assign(row, saved)
    editingId.value = null
    showSuccess('КС сохранена', `№ ${saved.number}`)
  } catch (error) {
    showError(error, 'Не удалось сохранить акт')
  } finally {
    isSaving.value = false
  }
}

const addRow = async () => {
  if (!validate(newDraft.value)) return
  isSaving.value = true
  try {
    const created = await createKsRecordRow({...newDraft.value})
    rows.value = [created, ...rows.value]
    isAdding.value = false
    showSuccess('КС добавлена', `№ ${created.number}`)
  } catch (error) {
    showError(error, 'Не удалось добавить акт')
  } finally {
    isSaving.value = false
  }
}

const removeRow = async (row: ErpKsRecordRow) => {
  isSaving.value = true
  try {
    await deleteKsRecordRow(row.id)
    rows.value = rows.value.filter(item => item.id !== row.id)
    if (editingId.value === row.id) editingId.value = null
    showSuccess('Акт удалён', `№ ${row.number}`)
  } catch (error) {
    showError(error, 'Не удалось удалить акт')
  } finally {
    isSaving.value = false
  }
}

const moneyFormat = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2})
</script>

<template>
  <ErpScreen
      title="КС"
      subtitle="Акты форм КС"
      icon="heroicons:document-currency-dollar"
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
      <section v-if="isAdding" ref="editForm" class="ks-new">
        <ErpSectionLabel>Новый акт</ErpSectionLabel>
        <label class="ks-field">
          <span class="ks-field__label">Договор</span>
          <ErpCombobox v-model="newDraft.contractInternalNumber" :options="contractOptions" placeholder="Внутренний номер договора"/>
        </label>
        <label class="ks-field">
          <span class="ks-field__label">Номер КС</span>
          <input v-model="newDraft.number" type="text" class="ks-input">
        </label>
        <label class="ks-field">
          <span class="ks-field__label">Сумма</span>
          <input v-model="newDraft.cost" type="text" inputmode="decimal" class="ks-input">
        </label>
        <label class="ks-field">
          <span class="ks-field__label">Статус</span>
          <ErpCombobox v-model="newDraft.status" :options="statusOptions" placeholder="Выберите статус"/>
        </label>
        <div class="ks-new__actions">
          <UiButton :loading="isSaving" @click="addRow">Добавить</UiButton>
          <UiButton variant="outline" @click="isAdding = false">Отмена</UiButton>
        </div>
      </section>

      <ErpEmptyState v-if="rows.length === 0 && !isAdding">
        <p>Пока нет заполненных строк</p>
        <UiButton variant="outline" @click="startAdding">Добавить</UiButton>
      </ErpEmptyState>

      <div v-else class="ks-list">
        <div v-for="row in rows" :key="row.id" class="ks-group">
          <div class="ks-row">
            <button type="button" class="ks-tap" @click="onRowTap(row)">
              <strong class="ks-tap__title">{{ row.contractInternalNumber }} · КС № {{ row.number || '—' }}</strong>
              <dl class="ks-tap__metrics">
                <div class="ks-tap__metric">
                  <dt>Сумма</dt>
                  <dd>{{ row.cost === null ? '—' : moneyFormat.format(row.cost) }}</dd>
                </div>
                <div class="ks-tap__metric">
                  <dt>Статус</dt>
                  <dd>{{ row.status || '—' }}</dd>
                </div>
              </dl>
            </button>
            <button
                type="button"
                class="ks-remove"
                :disabled="isSaving"
                aria-label="Удалить акт"
                @click="removeRow(row)"
            >
              <Icon name="heroicons:trash" size="15"/>
            </button>
          </div>

          <div v-if="editingId === row.id" ref="editForm" class="ks-edit">
            <label class="ks-field">
              <span class="ks-field__label">Договор</span>
              <ErpCombobox v-model="draft.contractInternalNumber" :options="contractOptions" placeholder="Внутренний номер договора"/>
            </label>
            <label class="ks-field">
              <span class="ks-field__label">Номер КС</span>
              <input v-model="draft.number" type="text" class="ks-input">
            </label>
            <label class="ks-field">
              <span class="ks-field__label">Сумма</span>
              <input v-model="draft.cost" type="text" inputmode="decimal" class="ks-input">
            </label>
            <label class="ks-field">
              <span class="ks-field__label">Статус</span>
              <ErpCombobox v-model="draft.status" :options="statusOptions" placeholder="Выберите статус"/>
            </label>
            <div class="ks-edit__actions">
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
.ks-new, .ks-group
  display: grid
  gap: 10px
  padding: 16px
  border-radius: 16px
  border: 0.5px solid rgba(60, 60, 67, 0.12)
  background: #fff
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06)

.ks-list
  display: grid
  gap: 10px

.ks-row
  // Не stretch: кнопка удаления тянулась во всю высоту карточки красной
  // полосой во весь бок — чем выше строка, тем крупнее выходило самое
  // разрушительное действие на экране.
  display: flex
  align-items: flex-start
  gap: 8px

.ks-tap
  flex: 1
  min-width: 0
  display: grid
  gap: 4px
  text-align: left
  background: none
  border: none
  padding: 0
  cursor: pointer

.ks-tap__title
  font-size: 15px
  font-weight: 700
  color: var(--color-text)
  overflow-wrap: anywhere

.ks-tap__meta
  margin: 0
  font-size: 12.5px
  color: var(--color-text-secondary)

// Строгие столбцы: сумму и статус видно без тапа, между актами их можно
// сравнить взглядом, не открывая каждый по очереди.
.ks-tap__metrics
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 8px
  margin: 8px 0 0
  padding-top: 8px
  border-top: 0.5px solid rgba(60, 60, 67, 0.1)

.ks-tap__metric
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

.ks-remove
  flex-shrink: 0
  width: 34px
  height: 34px
  display: flex
  align-items: center
  justify-content: center
  border: 1px solid rgba(220, 38, 38, 0.18)
  background: rgba(220, 38, 38, 0.07)
  color: #DC2626
  border-radius: 10px

  &:disabled
    opacity: 0.5

.ks-edit
  display: grid
  gap: 10px
  padding-top: 10px
  border-top: 0.5px solid rgba(60, 60, 67, 0.1)

.ks-field
  display: grid
  gap: 4px

.ks-field__label
  font-size: 11px
  font-weight: 600
  color: var(--color-text-secondary)

.ks-input
  padding: 10px 12px
  border: 0.5px solid rgba(60, 60, 67, 0.16)
  border-radius: 10px
  background: var(--color-card-bg)
  color: var(--color-text)

.ks-new__actions, .ks-edit__actions
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 8px
  margin-top: 4px
</style>
