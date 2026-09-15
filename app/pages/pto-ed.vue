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
const query = ref('')

// Порядок групп на экране — не алфавит и не порядок справочника, а очередь
// работы отдела: сверху то, что двигается к подписанию, внизу «Подписана» —
// закрытое, к нему возвращаться не нужно.
const STATUS_ORDER = [
  'Согласована',
  'На проверке СК',
  'Подготовка',
  'На проверке ГСП',
  'Устранение замечаний',
  'Не хватает Инспекций',
  'Не хватает АВК',
  'Нет ПОЗ',
  'Подписана',
]

// Здесь только принадлежность статуса к тону, сами цвета — в стилях. Иначе
// одно и то же значение пришлось бы держать в двух местах.
const STATUS_TONE: Record<string, string> = {
  'Согласована': 'ok',
  'На проверке СК': 'info',
  'Подготовка': 'warn',
  'На проверке ГСП': 'info',
  'Устранение замечаний': 'warn',
  'Не хватает Инспекций': 'warn',
  'Не хватает АВК': 'warn',
  'Нет ПОЗ': 'alert',
  'Подписана': 'done',
}

const NO_STATUS = 'Без статуса'

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

const visibleRows = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return rows.value
  return rows.value.filter(row => row.title.toLowerCase().includes(needle))
})

/** Статус вне порядка из ТЗ («Забрал ВЛС», «Гарантийный объём», пустой) не
 * теряется и не притворяется чужим: своя группа после известных и нейтральный
 * тон — иначе запись пропала бы с экрана вместе со своей строкой в базе.
 */
const statusRank = (status: string): number => {
  const index = STATUS_ORDER.indexOf(status)
  return index === -1 ? STATUS_ORDER.length : index
}

const groups = computed(() => {
  const byStatus = new Map<string, ErpEdRow[]>()
  for (const row of visibleRows.value) {
    const status = row.status || NO_STATUS
    const bucket = byStatus.get(status)
    if (bucket) bucket.push(row)
    else byStatus.set(status, [row])
  }

  return [...byStatus.entries()]
      .map(([status, items]) => ({status, items, tone: STATUS_TONE[status] ?? 'neutral'}))
      .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.status.localeCompare(b.status, 'ru'))
})

// При пустой выдаче счётчик молчит: про «ничего не найдено» уже говорит
// само тело экрана, и два раза подряд одно и то же выглядит небрежно.
const searchCountLabel = computed(() => {
  if (!query.value.trim() || visibleRows.value.length === 0) return ''
  return `Найдено: ${visibleRows.value.length}`
})

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

const formatAmount = (value: number | null): string => value === null ? '—' : new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2}).format(value)

// Статуса и договора в карточке больше нет: статус несут заголовок группы и
// цвет, а договор в списке одной стройки ничего не различает.
const rowMetrics = (row: ErpEdRow) => [
  {label: 'Объём', value: formatAmount(row.volume)},
  {label: 'Стоимость', value: formatAmount(row.cost)},
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

    <template v-if="!isLoading && !loadError && rows.length > 0" #search>
      <ErpSearchBar v-model="query" placeholder="Поиск по титулу" :count-label="searchCountLabel"/>
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

      <ErpEmptyState v-else-if="visibleRows.length === 0">
        <p>По запросу «{{ query.trim() }}» ничего не найдено</p>
        <UiButton variant="outline" @click="query = ''">Сбросить поиск</UiButton>
      </ErpEmptyState>

      <div v-else class="ed-groups">
        <section v-for="group in groups" :key="group.status" class="ed-group">
          <header class="ed-group__head">
            <span class="ed-group__dot" :class="`ed-tone--${group.tone}`" aria-hidden="true"/>
            <h2 class="ed-group__title">{{ group.status }}</h2>
            <span class="ed-group__count">{{ group.items.length }}</span>
          </header>

          <div class="ed-group__list">
            <article
                v-for="row in group.items"
                :key="row.id"
                class="ed-card"
                :class="`ed-tone--${group.tone}`"
            >
              <button type="button" class="ed-tap" @click="onRowTap(row)">
                <strong class="ed-tap__title">{{ row.title || row.aosr || 'Без титула' }}</strong>
                <p class="ed-tap__aosr">
                  <span class="ed-tap__aosr-label">АОСР</span>
                  <span class="ed-tap__aosr-value">{{ row.aosr || '—' }}</span>
                </p>
                <dl class="ed-tap__metrics">
                  <div v-for="metric in rowMetrics(row)" :key="metric.label" class="ed-tap__metric">
                    <dt>{{ metric.label }}</dt>
                    <dd>{{ metric.value }}</dd>
                  </div>
                </dl>
              </button>

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
                <!-- Удаление ушло из карточки, но не из раздела: в закрытом
                     списке кнопка стояла под большим пальцем и удаляла по
                     промаху, а здесь до неё нужно сначала открыть запись. -->
                <button type="button" class="ed-delete" :disabled="isSaving" @click="removeRow(row)">
                  <Icon name="heroicons:trash" size="14"/>
                  Удалить запись
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </template>
  </ErpScreen>
</template>

<style scoped lang="sass">
// Цвета статусов из ТЗ — заливка. Контур к ним подобран темнее той же краски:
// фон экрана бледно-синий (#EAF2FD), и «На проверке» (#d9e1f2) без контура на
// нём попросту растворяется.
.ed-tone--ok
  --ed-fill: #e2efda
  --ed-line: #a3cd8e

.ed-tone--info
  --ed-fill: #d9e1f2
  --ed-line: #94afd9

.ed-tone--warn
  --ed-fill: #fff2cc
  --ed-line: #e3c25c

.ed-tone--alert
  --ed-fill: #ed7d31
  --ed-line: #bd5a13

.ed-tone--done
  --ed-fill: #a9d08e
  --ed-line: #6ea555

// Статус, которого нет в ТЗ, не выдумывает себе цвет: белая карточка с
// обычным контуром, как у остальных экранов раздела.
.ed-tone--neutral
  --ed-fill: #ffffff
  --ed-line: rgba(60, 60, 67, 0.18)

.ed-groups
  display: grid
  gap: 18px

.ed-group
  display: grid
  gap: 8px

.ed-group__head
  display: flex
  align-items: center
  gap: 8px
  padding: 0 2px

.ed-group__dot
  flex-shrink: 0
  width: 12px
  height: 12px
  border-radius: 4px
  background: var(--ed-fill)
  border: 1px solid var(--ed-line)

.ed-group__title
  margin: 0
  font-size: 13px
  font-weight: 700
  color: var(--color-text)

.ed-group__count
  margin-left: auto
  min-width: 22px
  padding: 1px 7px
  border-radius: 999px
  background: rgba(60, 60, 67, 0.09)
  font-size: 11.5px
  font-weight: 700
  font-variant-numeric: tabular-nums
  color: var(--color-text-secondary)

.ed-group__list
  display: grid
  gap: 8px

.ed-card
  // Тёмные чернила держат контраст на всех пяти заливках ТЗ, включая самую
  // насыщенную (#ed7d31): белый текст на ней даёт 2,8:1 и нечитаем.
  --ed-ink: #16202e
  --ed-ink-dim: rgba(22, 32, 46, 0.72)
  padding: 14px 16px
  border-radius: 16px
  background: var(--ed-fill)
  border: 1px solid var(--ed-line)
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.07)

// Подписи колонок на самой насыщенной заливке: 0,72 даёт на #ed7d31 всего
// 3,1:1 — ниже порога читаемости, поэтому там они почти непрозрачные.
.ed-card.ed-tone--alert
  --ed-ink-dim: rgba(22, 32, 46, 0.9)

.ed-tap
  width: 100%
  display: grid
  gap: 4px
  text-align: left
  background: none
  border: none
  padding: 0
  cursor: pointer
  color: var(--ed-ink)

.ed-tap__title
  font-size: 15px
  font-weight: 700
  overflow-wrap: anywhere

.ed-tap__aosr
  margin: 0
  display: flex
  flex-wrap: wrap
  align-items: baseline
  gap: 6px
  font-size: 12.5px

.ed-tap__aosr-label
  font-size: 10.5px
  font-weight: 600
  text-transform: uppercase
  letter-spacing: 0.03em
  color: var(--ed-ink-dim)

.ed-tap__aosr-value
  overflow-wrap: anywhere
  font-weight: 600
  color: var(--ed-ink)

// Строгие столбцы: объём и стоимость стоят на одном месте во всех карточках,
// их можно сравнить взглядом, не открывая каждую запись.
.ed-tap__metrics
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 8px
  margin: 10px 0 0
  padding-top: 9px
  border-top: 1px solid var(--ed-line)

.ed-tap__metric
  min-width: 0
  display: grid
  gap: 2px

  dt
    margin: 0
    font-size: 10.5px
    font-weight: 600
    text-transform: uppercase
    letter-spacing: 0.03em
    color: var(--ed-ink-dim)

  dd
    margin: 0
    overflow-wrap: anywhere
    font-size: 14px
    font-weight: 700
    font-variant-numeric: tabular-nums
    color: var(--ed-ink)

.ed-new
  display: grid
  gap: 10px
  padding: 16px
  margin-bottom: 14px
  border-radius: 16px
  border: 0.5px solid rgba(60, 60, 67, 0.12)
  background: #fff
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06)

.ed-edit
  display: grid
  gap: 10px
  margin-top: 12px
  padding-top: 12px
  border-top: 1px solid var(--ed-line)

.ed-field
  display: grid
  gap: 4px

.ed-field__label
  font-size: 11px
  font-weight: 600
  color: rgba(22, 32, 46, 0.7)

.ed-input
  padding: 10px 12px
  border: 1px solid rgba(60, 60, 67, 0.16)
  border-radius: 10px
  background: #fff
  color: var(--color-text)

.ed-new__actions, .ed-edit__actions
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 8px
  margin-top: 4px

.ed-delete
  display: flex
  align-items: center
  justify-content: center
  gap: 6px
  width: 100%
  min-height: 38px
  border: 1px solid rgba(220, 38, 38, 0.35)
  border-radius: 10px
  background: rgba(255, 255, 255, 0.75)
  color: #B91C1C
  font-size: 13px
  font-weight: 600

  &:disabled
    opacity: 0.5

@media (max-width: 400px)
  .ed-card
    padding: 13px 13px

  .ed-tap__metrics
    grid-template-columns: 1fr
    gap: 0

  .ed-tap__metric
    grid-template-columns: minmax(0, 1fr) auto
    align-items: baseline
    padding-top: 6px

    dd
      text-align: right
</style>
