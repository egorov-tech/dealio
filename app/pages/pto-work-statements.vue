<script setup lang="ts">
import {
  createWorkStatementRow,
  deleteWorkStatementRow,
  fetchPtoContracts,
  fetchPtoRateParams,
  fetchWorkStatementRows,
  updateWorkStatementRow,
} from '~/utils/erp-pto'
import type {ErpPtoContract, ErpWorkStatementRow} from '~/utils/erp-pto'
import type {ErpComboboxOption} from '~/components/erp/ErpCombobox.vue'
import {useAppToast} from '~/composables/useAppToast'

definePageMeta({layout: 'erp'})
useSeoMeta({title: 'Ведомость работ | ERP'})

const {showSuccess, showError} = useAppToast()

const rows = ref<ErpWorkStatementRow[]>([])
const contracts = ref<ErpPtoContract[]>([])
const isLoading = ref(true)
const loadError = ref('')
const isSaving = ref(false)

const contractOptions = computed<ErpComboboxOption[]>(() =>
    contracts.value.map(item => ({value: item.internalNumber, hint: item.customer})),
)

const load = async () => {
  isLoading.value = true
  loadError.value = ''
  try {
    const [statements, contractList] = await Promise.all([fetchWorkStatementRows(), fetchPtoContracts()])
    rows.value = statements
    contracts.value = contractList
  } catch (error) {
    loadError.value = errorMessage(error, 'Не удалось загрузить ведомость')
  } finally {
    isLoading.value = false
  }
}
onMounted(load)

type Draft = {
  contractInternalNumber: string
  workDescription: string
  tag: string
  material: string
  thickness: string
  fireResistance: string
  theoreticalConsumption: string
  param1: string
  param2: string
}
const emptyDraft = (): Draft => ({
  contractInternalNumber: '', workDescription: '', tag: '', material: '',
  thickness: '', fireResistance: '', theoreticalConsumption: '', param1: '', param2: '',
})

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

// Значения, которыми уже пользуется договор в расценках — подсказка для
// «сверки», а не жёсткая проверка: расценки на договор могут быть ещё не
// заведены, и тег/предел вводятся свободно.
const editParams = ref<{param1: string[]; param2: string[]}>({param1: [], param2: []})
const newParams = ref<{param1: string[]; param2: string[]}>({param1: [], param2: []})
const editParam1Options = computed<ErpComboboxOption[]>(() => editParams.value.param1.map(value => ({value})))
const editParam2Options = computed<ErpComboboxOption[]>(() => editParams.value.param2.map(value => ({value})))
const newParam1Options = computed<ErpComboboxOption[]>(() => newParams.value.param1.map(value => ({value})))
const newParam2Options = computed<ErpComboboxOption[]>(() => newParams.value.param2.map(value => ({value})))

watch(() => draft.value.contractInternalNumber, async (contract) => {
  editParams.value = await fetchPtoRateParams(contract).catch(() => ({param1: [], param2: []}))
})
watch(() => newDraft.value.contractInternalNumber, async (contract) => {
  newParams.value = await fetchPtoRateParams(contract).catch(() => ({param1: [], param2: []}))
})

const onRowTap = async (row: ErpWorkStatementRow) => {
  if (editingId.value === row.id) {
    editingId.value = null
    return
  }
  isAdding.value = false
  editingId.value = row.id
  draft.value = {
    contractInternalNumber: row.contractInternalNumber,
    workDescription: row.workDescription,
    tag: row.tag,
    material: row.material,
    thickness: editableNumber(row.thickness),
    fireResistance: row.fireResistance,
    theoreticalConsumption: editableNumber(row.theoreticalConsumption),
    param1: row.param1,
    param2: row.param2,
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
  return true
}

const saveDraft = async (row: ErpWorkStatementRow) => {
  if (!validate(draft.value)) return
  isSaving.value = true
  try {
    const saved = await updateWorkStatementRow(row.id, {...draft.value})
    Object.assign(row, saved)
    editingId.value = null
    showSuccess('Ведомость сохранена', saved.workDescription || saved.tag)
  } catch (error) {
    showError(error, 'Не удалось сохранить строку')
  } finally {
    isSaving.value = false
  }
}

const addRow = async () => {
  if (!validate(newDraft.value)) return
  isSaving.value = true
  try {
    const created = await createWorkStatementRow({...newDraft.value})
    rows.value = [created, ...rows.value]
    isAdding.value = false
    showSuccess('Строка добавлена', created.workDescription || created.tag)
  } catch (error) {
    showError(error, 'Не удалось добавить строку')
  } finally {
    isSaving.value = false
  }
}

const removeRow = async (row: ErpWorkStatementRow) => {
  isSaving.value = true
  try {
    await deleteWorkStatementRow(row.id)
    rows.value = rows.value.filter(item => item.id !== row.id)
    if (editingId.value === row.id) editingId.value = null
    showSuccess('Строка удалена', row.workDescription || row.tag)
  } catch (error) {
    showError(error, 'Не удалось удалить строку')
  } finally {
    isSaving.value = false
  }
}

// Значения в закрытой карточке — тоже столбцами: материал, толщину и предел
// огнестойкости нужно сравнивать между строками, не открывая каждую по
// очереди.
const formatAmount = (value: number | null): string => value === null ? '—' : new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2}).format(value)

const rowMetrics = (row: ErpWorkStatementRow) => [
  // Тег — такая же колонка ведомости, как остальные: в заголовок он попадает
  // только когда описание работы пустое, и без своей колонки строки с
  // описанием прятали бы его совсем.
  {label: 'Тег', value: row.tag || '—'},
  {label: 'Материал', value: row.material || '—'},
  {label: 'Толщина, мкм', value: formatAmount(row.thickness)},
  {label: 'Предел', value: row.fireResistance || '—'},
  {label: 'Теор. расход', value: formatAmount(row.theoreticalConsumption)},
  {label: 'Параметр 1', value: row.param1 || '—'},
  {label: 'Параметр 2', value: row.param2 || '—'},
]
</script>

<template>
  <ErpScreen
      title="Ведомость работ"
      subtitle="Проектные характеристики работ"
      icon="heroicons:document-text"
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
      <section v-if="isAdding" ref="editForm" class="wr-new">
        <ErpSectionLabel>Новая строка</ErpSectionLabel>
        <label class="wr-field">
          <span class="wr-field__label">Номер договора</span>
          <ErpCombobox v-model="newDraft.contractInternalNumber" :options="contractOptions" placeholder="Внутренний номер договора"/>
        </label>
        <label class="wr-field">
          <span class="wr-field__label">Описание работы</span>
          <textarea v-model="newDraft.workDescription" class="wr-textarea" rows="2"/>
        </label>
        <label class="wr-field">
          <span class="wr-field__label">Тег</span>
          <input v-model="newDraft.tag" type="text" class="wr-input">
        </label>
        <label class="wr-field">
          <span class="wr-field__label">Материал</span>
          <input v-model="newDraft.material" type="text" class="wr-input">
        </label>
        <label class="wr-field">
          <span class="wr-field__label">Толщина, мкм</span>
          <input v-model="newDraft.thickness" type="text" inputmode="decimal" class="wr-input">
        </label>
        <label class="wr-field">
          <span class="wr-field__label">Предел огнестойкости</span>
          <input v-model="newDraft.fireResistance" type="text" class="wr-input">
        </label>
        <label class="wr-field">
          <span class="wr-field__label">Теор. расход</span>
          <input v-model="newDraft.theoreticalConsumption" type="text" inputmode="decimal" class="wr-input">
        </label>
        <label class="wr-field">
          <span class="wr-field__label">Параметр 1</span>
          <ErpCombobox v-model="newDraft.param1" :options="newParam1Options" allow-free-text placeholder="Сверяется с расценками договора"/>
        </label>
        <label class="wr-field">
          <span class="wr-field__label">Параметр 2</span>
          <ErpCombobox v-model="newDraft.param2" :options="newParam2Options" allow-free-text placeholder="Сверяется с расценками договора"/>
        </label>
        <div class="wr-new__actions">
          <UiButton :loading="isSaving" @click="addRow">Добавить</UiButton>
          <UiButton variant="outline" @click="isAdding = false">Отмена</UiButton>
        </div>
      </section>

      <ErpEmptyState v-if="rows.length === 0 && !isAdding">
        <p>Пока нет заполненных строк</p>
        <UiButton variant="outline" @click="startAdding">Добавить</UiButton>
      </ErpEmptyState>

      <div v-else class="wr-list">
        <div v-for="row in rows" :key="row.id" class="wr-group">
          <div class="wr-row">
            <button type="button" class="wr-tap" @click="onRowTap(row)">
              <strong class="wr-tap__title">{{ row.workDescription || row.tag || 'Без описания' }}</strong>
              <p class="wr-tap__meta">{{ row.contractInternalNumber }}</p>
              <dl class="wr-tap__metrics">
                <div v-for="metric in rowMetrics(row)" :key="metric.label" class="wr-tap__metric">
                  <dt>{{ metric.label }}</dt>
                  <dd>{{ metric.value }}</dd>
                </div>
              </dl>
            </button>
            <button
                type="button"
                class="wr-remove"
                :disabled="isSaving"
                aria-label="Удалить строку"
                @click="removeRow(row)"
            >
              <Icon name="heroicons:trash" size="15"/>
            </button>
          </div>

          <div v-if="editingId === row.id" ref="editForm" class="wr-edit">
            <label class="wr-field">
              <span class="wr-field__label">Номер договора</span>
              <ErpCombobox v-model="draft.contractInternalNumber" :options="contractOptions" placeholder="Внутренний номер договора"/>
            </label>
            <label class="wr-field">
              <span class="wr-field__label">Описание работы</span>
              <textarea v-model="draft.workDescription" class="wr-textarea" rows="2"/>
            </label>
            <label class="wr-field">
              <span class="wr-field__label">Тег</span>
              <input v-model="draft.tag" type="text" class="wr-input">
            </label>
            <label class="wr-field">
              <span class="wr-field__label">Материал</span>
              <input v-model="draft.material" type="text" class="wr-input">
            </label>
            <label class="wr-field">
              <span class="wr-field__label">Толщина, мкм</span>
              <input v-model="draft.thickness" type="text" inputmode="decimal" class="wr-input">
            </label>
            <label class="wr-field">
              <span class="wr-field__label">Предел огнестойкости</span>
              <input v-model="draft.fireResistance" type="text" class="wr-input">
            </label>
            <label class="wr-field">
              <span class="wr-field__label">Теор. расход</span>
              <input v-model="draft.theoreticalConsumption" type="text" inputmode="decimal" class="wr-input">
            </label>
            <label class="wr-field">
              <span class="wr-field__label">Параметр 1</span>
              <ErpCombobox v-model="draft.param1" :options="editParam1Options" allow-free-text placeholder="Сверяется с расценками договора"/>
            </label>
            <label class="wr-field">
              <span class="wr-field__label">Параметр 2</span>
              <ErpCombobox v-model="draft.param2" :options="editParam2Options" allow-free-text placeholder="Сверяется с расценками договора"/>
            </label>
            <div class="wr-edit__actions">
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
.wr-new, .wr-group
  display: grid
  gap: 10px
  padding: 16px
  border-radius: 16px
  border: 0.5px solid rgba(60, 60, 67, 0.12)
  background: #fff
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06)

.wr-list
  display: grid
  gap: 10px

.wr-row
  // Не stretch: кнопка удаления тянулась во всю высоту карточки красной
  // полосой во весь бок — чем выше строка, тем крупнее выходило самое
  // разрушительное действие на экране.
  display: flex
  align-items: flex-start
  gap: 8px

.wr-tap
  flex: 1
  min-width: 0
  display: grid
  gap: 4px
  text-align: left
  background: none
  border: none
  padding: 0
  cursor: pointer

.wr-tap__title
  font-size: 15px
  font-weight: 700
  color: var(--color-text)
  overflow-wrap: anywhere

.wr-tap__meta
  margin: 0
  display: flex
  flex-wrap: wrap
  gap: 6px
  font-size: 12.5px
  color: var(--color-text-secondary)

// Строгие столбцы: материал, толщину, предел и параметры видно без тапа —
// между строками их можно сравнить взглядом, не открывая каждую по очереди.
.wr-tap__metrics
  display: grid
  grid-template-columns: repeat(3, minmax(0, 1fr))
  gap: 8px
  margin: 8px 0 0
  padding-top: 8px
  border-top: 0.5px solid rgba(60, 60, 67, 0.1)

.wr-tap__metric
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
  .wr-tap__metrics
    grid-template-columns: repeat(2, minmax(0, 1fr))

.wr-remove
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

.wr-edit
  display: grid
  gap: 10px
  padding-top: 10px
  border-top: 0.5px solid rgba(60, 60, 67, 0.1)

.wr-field
  display: grid
  gap: 4px

.wr-field__label
  font-size: 11px
  font-weight: 600
  color: var(--color-text-secondary)

.wr-input, .wr-textarea
  padding: 10px 12px
  border: 0.5px solid rgba(60, 60, 67, 0.16)
  border-radius: 10px
  background: var(--color-card-bg)
  color: var(--color-text)
  font-family: inherit

.wr-textarea
  resize: vertical

.wr-new__actions, .wr-edit__actions
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 8px
  margin-top: 4px
</style>
