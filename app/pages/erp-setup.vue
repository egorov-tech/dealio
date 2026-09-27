<script setup lang="ts">
import {
    getErpGasUrl,
    getErpSheetsMode,
    saveErpGasUrl,
    testErpGasConnection,
} from '~/utils/erp-sheets'

definePageMeta({layout: 'erp'})

useSeoMeta({title: 'Подключение таблицы | ERP'})

const runtimeConfig = useRuntimeConfig()
const spreadsheetId = computed(() => String(runtimeConfig.public.erpSpreadsheetId || '').trim())
const spreadsheetHref = computed(() =>
    spreadsheetId.value
        ? `https://docs.google.com/spreadsheets/d/${spreadsheetId.value}/edit`
        : '',
)

const gasUrl = ref(getErpGasUrl())
const testResult = ref('')
const isTesting = ref(false)
const sheetsMode = computed(() => getErpSheetsMode())

const GAS_CODE_FILE = 'scripts/erp-gas-webapp.js'
const FINDTAG_PROJECT_URL = 'https://script.google.com/home/projects/1m7e2q7A6IxEaf6xT10US-AATUyms3BgEbInPCVg_fWOr3-dztQrYY76s/edit'

const saveUrl = () => {
    if (!gasUrl.value.trim()) {
        testResult.value = 'Вставьте URL Web App перед сохранением'
        return
    }

    saveErpGasUrl(gasUrl.value.trim())
    testResult.value = 'URL сохранён в localStorage'
}

const runTest = async () => {
    if (!gasUrl.value.trim()) {
        testResult.value = 'Вставьте URL Web App'
        return
    }

    isTesting.value = true
    testResult.value = 'Проверка…'

    const result = await testErpGasConnection(gasUrl.value.trim())
    if (result.ok) {
        saveErpGasUrl(gasUrl.value.trim())
        testResult.value = `OK · Колпино: ${result.badgesCount} бирок`
    } else {
        testResult.value = result.error || 'Ошибка'
    }

    isTesting.value = false
}
</script>

<template>
  <ErpScreen title="Подключение таблицы">
    <p class="setup-lead">
      Таблица:
      <a
          v-if="spreadsheetHref"
          :href="spreadsheetHref"
          target="_blank"
          rel="noopener"
      >Ведомости</a>
      <span v-else>не задана в окружении (NUXT_PUBLIC_ERP_SPREADSHEET_ID)</span>
    </p>

    <div class="setup-card">
      <p class="setup-card__title">Чтение бирок</p>
      <p class="setup-card__status">
        Режим: <strong>{{ sheetsMode === 'csv' ? 'таблица (CSV)' : sheetsMode }}</strong>
      </p>
      <p class="setup-card__hint">
        ID таблицы и листа задаются только через env на стенде/проде — в публичном
        репозитории дефолтов нет.
      </p>
    </div>

    <div class="setup-card">
      <p class="setup-card__title">Выдача бирки — отдельный скрипт</p>
      <p class="setup-card__hint setup-card__hint--warn">
        <a :href="FINDTAG_PROJECT_URL" target="_blank" rel="noopener">FindTagMFT</a>
        (Telegram-бот) не трогаем — у него свой деплой и триггеры.
        ERP — новый проект Apps Script только для журнала.
      </p>
      <ol class="setup-steps">
        <li><a href="https://script.google.com/home" target="_blank" rel="noopener">script.google.com</a> → <strong>Создать проект</strong> (название, напр. «ERP Ведомости»)</li>
        <li>Вставьте код из <code>{{ GAS_CODE_FILE }}</code></li>
        <li><strong>Развернуть → Новое развёртывание → Веб-приложение</strong></li>
        <li>Запуск от имени: <strong>Я</strong> · Доступ: <strong>Все</strong></li>
        <li>URL веб-приложения → вставьте ниже</li>
      </ol>

      <label class="setup-field">
        <span>URL Web App</span>
        <input v-model="gasUrl" type="url" placeholder="https://script.google.com/macros/s/.../exec">
      </label>

      <div class="setup-actions">
        <UiButton :disabled="isTesting" @click="runTest">
          Проверить
        </UiButton>
        <UiButton variant="outline" @click="saveUrl">
          Сохранить
        </UiButton>
      </div>

      <p v-if="testResult" class="setup-result">{{ testResult }}</p>
    </div>
  </ErpScreen>
</template>

<style scoped lang="sass">
.setup-lead
  margin: 0 0 var(--spacing-4)
  font-size: var(--font-size-sm)
  color: var(--color-text-secondary)

.setup-card
  padding: var(--spacing-4)
  margin-bottom: var(--spacing-4)
  border: var(--border-width) solid var(--color-border)
  border-radius: var(--radius-lg)
  background: var(--color-card-bg)

.setup-card__title
  margin: 0 0 var(--spacing-2)
  font-weight: 600

.setup-card__status
  margin: 0 0 var(--spacing-2)
  font-size: var(--font-size-sm)

.setup-card__hint
  margin: 0 0 var(--spacing-3)
  font-size: var(--font-size-sm)
  color: var(--color-text-secondary)

  &--warn
    padding: 10px 12px
    border-radius: var(--radius-md)
    background: rgba(234, 179, 8, 0.12)
    color: var(--color-text)

.setup-steps
  margin: 0 0 var(--spacing-4)
  padding-left: 1.2rem
  font-size: var(--font-size-sm)
  line-height: 1.6

.setup-field
  display: flex
  flex-direction: column
  gap: var(--spacing-2)
  margin-bottom: var(--spacing-3)
  font-size: var(--font-size-sm)

  input
    padding: 10px 12px
    border: var(--border-width) solid var(--color-border)
    border-radius: var(--radius-md)
    background: var(--color-bg)
    color: var(--color-text)

.setup-actions
  display: flex
  gap: var(--spacing-2)

.setup-result
  margin: var(--spacing-3) 0 0
  font-size: var(--font-size-sm)
  color: var(--color-text-secondary)

.setup-note
  margin: 0
  font-size: var(--font-size-xs)
  color: var(--color-text-muted)
  white-space: pre-line
</style>
