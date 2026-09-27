<script setup lang="ts">
import {useErpEmployeeStore} from '~~/store/erp-employee.store'
import {useErpApprovalsStore} from '~~/store/erp-approvals.store'
import {useErpSupplyQueueStore} from '~~/store/erp-supply-queue.store'
import {loginErpEmployee, isErpDemoMode} from '~/utils/erp-sheets'
import {useAppToast} from '~/composables/useAppToast'

definePageMeta({layout: 'erp'})

const employeeStore = useErpEmployeeStore()
const approvalsStore = useErpApprovalsStore()
const supplyQueueStore = useErpSupplyQueueStore()
const isDemo = isErpDemoMode()

const pageTitle = ref(employeeStore.hasFio ? 'Профиль | ERP' : 'Вход | ERP')
watch(() => employeeStore.hasFio, (hasFio) => {
    pageTitle.value = hasFio ? 'Профиль | ERP' : 'Вход | ERP'
})
useSeoMeta({title: pageTitle})
const router = useRouter()
const {showSuccess} = useAppToast()

const loginField = ref('')
const password = ref('')
const error = ref('')
const isLoading = ref(false)

// Имя из ФИО (Фамилия Имя Отчество) — для приветствия
const firstName = computed(() => employeeStore.fio.trim().split(/\s+/)[1] ?? '')
const greetingWord = () => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return 'Доброе утро'
    if (hour >= 12 && hour < 18) return 'Добрый день'
    return 'Добрый вечер'
}
const greeting = computed(() => firstName.value ? `${greetingWord()}, ${firstName.value}` : greetingWord())
// Строка над именем: «Площадка · 4 июля». Слово «Смена» убрано — оно ничего
// не сообщало сверх того, что человек и так знает, открыв рабочее приложение.
const shiftOverline = computed(() => {
    const date = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long'}).format(new Date())
    return [employeeStore.platform, date].filter(Boolean).join(' · ')
})

// Модули хаба — те же, что в таб-баре, фильтр по доступам сотрудника
// Плитки строятся из общего реестра разделов — того же, что и таб-бар.
// Пока список жил в двух местах, он разошёлся: «Договоры» были на плитках,
// но не в нижнем меню.
const modules = computed(() =>
    erpSectionsFor(employeeStore.access).map(section => ({
        ...section,
        // Счётчик — у согласований (число ждущих решения) и у снабжения
        // (число новых заявок без счёта): оба раздела, где это число нужно
        // видеть, не заходя внутрь.
        count: section.key === 'approvals' && approvalsStore.pendingCount > 0
            ? approvalsStore.pendingCount
            : section.key === 'supply' && supplyQueueStore.newCount > 0
                ? supplyQueueStore.newCount
                : null,
    })),
)

const submit = async () => {
    if (!loginField.value.trim() || !password.value) {
        error.value = 'Введите логин и пароль'
        return
    }

    isLoading.value = true
    error.value = ''

    try {
        const profile = await loginErpEmployee(loginField.value.trim(), password.value)
        employeeStore.setProfile(profile)
        password.value = ''
    } catch (loginError) {
        error.value = errorMessage(loginError, 'Не удалось войти')
    } finally {
        isLoading.value = false
    }
}

const enterDemo = async () => {
    isLoading.value = true
    error.value = ''
    try {
        const profile = await loginErpEmployee('demo', 'demo')
        employeeStore.setProfile(profile)
        // Сразу в цех Колпино — рекрутер видит список бирок без лишних кликов.
        employeeStore.setWorkshop('kolpino')
        await router.push('/badges')
    } catch (loginError) {
        error.value = errorMessage(loginError, 'Не удалось открыть демо')
    } finally {
        isLoading.value = false
    }
}

const logout = () => {
    employeeStore.logout()
    loginField.value = ''
    password.value = ''
}

const copyText = async (text: string, label: string) => {
    try {
        await navigator.clipboard.writeText(text)
        showSuccess(`${label} скопирован`)
    } catch {
        // clipboard недоступен (HTTP или права) — молча пропускаем
    }
}
</script>

<template>
  <ErpScreen
      v-if="employeeStore.hasFio"
      :title="greeting"
      :subtitle="employeeStore.position || undefined"
      :overline="shiftOverline"
  >
    <template #actions>
      <button type="button" class="logout-btn" aria-label="Выйти" @click="logout">
        <Icon name="heroicons:arrow-right-on-rectangle" size="20"/>
      </button>
    </template>

    <ErpSectionLabel>Разделы</ErpSectionLabel>
    <div class="hub-grid">
      <ErpTile
          v-for="m in modules"
          :key="m.to"
          :to="m.to"
          :icon="m.icon"
          :label="m.label"
          :caption="m.caption"
          :count="m.count"
          :tone="m.tone"
      />
    </div>

    <ErpSectionLabel>Профиль</ErpSectionLabel>
    <ErpGroupedList>
      <ErpListRow v-if="employeeStore.department" tag="div">
        <span class="profile-kv">
          <span class="profile-kv__label">Отдел</span>
          <span class="profile-kv__value">{{ employeeStore.department }}</span>
        </span>
      </ErpListRow>
      <ErpListRow v-if="employeeStore.position" tag="div">
        <span class="profile-kv">
          <span class="profile-kv__label">Должность</span>
          <span class="profile-kv__value">{{ employeeStore.position }}</span>
        </span>
      </ErpListRow>
      <ErpListRow v-if="employeeStore.platform" tag="div">
        <span class="profile-kv">
          <span class="profile-kv__label">Площадка</span>
          <span class="profile-kv__value">{{ employeeStore.platform }}</span>
        </span>
      </ErpListRow>
      <ErpListRow v-if="employeeStore.login" @click="copyText(employeeStore.login, 'Логин')">
        <span class="profile-kv">
          <span class="profile-kv__label">Логин</span>
          <span class="profile-kv__value">{{ employeeStore.login }}</span>
        </span>
        <template #trailing>
          <Icon name="heroicons:clipboard-document" size="16" class="profile-kv__icon"/>
        </template>
      </ErpListRow>
      <ErpListRow v-if="employeeStore.password" @click="copyText(employeeStore.password, 'Пароль')">
        <span class="profile-kv">
          <span class="profile-kv__label">Пароль</span>
          <span class="profile-kv__value profile-kv__value--mono">{{ employeeStore.password }}</span>
        </span>
        <template #trailing>
          <Icon name="heroicons:clipboard-document" size="16" class="profile-kv__icon"/>
        </template>
      </ErpListRow>
    </ErpGroupedList>

    <ErpSectionLabel>Помощь</ErpSectionLabel>
    <ErpGroupedList>
      <ErpListRow chevron @click="router.push('/notifications-guide')">
        <template #leading>
          <Icon name="heroicons:bell" size="18" class="profile-kv__icon"/>
        </template>
        Как включить уведомления
      </ErpListRow>
    </ErpGroupedList>
  </ErpScreen>

  <ErpScreen
      v-else
      center-brand
      title="Морфлот Технология"
      subtitle="Цифровой контур предприятия"
  >
    <div class="login-card">
      <h2 class="login-card__title">Вход</h2>
      <p v-if="isDemo" class="login-card__demo">
        Публичное демо на синтетических данных — без доступа к таблице заказчика.
      </p>
      <form v-if="!isDemo" class="register-form" @submit.prevent="submit">
        <UiInput
            id="erp-login"
            v-model="loginField"
            label="Логин"
            autocomplete="username"
            @keyup.enter="submit"
        />
        <UiInput
            id="erp-password"
            v-model="password"
            type="password"
            label="Пароль"
            autocomplete="current-password"
            :error="error"
            @keyup.enter="submit"
        />
        <UiButton block size="lg" :loading="isLoading" @click="submit">
          Войти
        </UiButton>
      </form>
      <div v-else class="register-form">
        <p v-if="error" class="login-card__error">{{ error }}</p>
        <UiButton block size="lg" :loading="isLoading" @click="enterDemo">
          Открыть демо · бирки
        </UiButton>
      </div>
    </div>
  </ErpScreen>
</template>

<style scoped lang="sass">
.logout-btn
  display: flex
  align-items: center
  justify-content: center
  width: 34px
  height: 34px
  border: none
  border-radius: var(--radius-full)
  background: rgba(255, 255, 255, 0.18)
  color: #fff
  cursor: pointer
  transition: opacity 0.15s ease

  &:hover
    opacity: 0.75

.hub-grid
  display: grid
  grid-template-columns: 1fr 1fr
  gap: var(--spacing-3)

.profile-kv
  display: flex
  align-items: center
  gap: 12px
  width: 100%
  min-width: 0

.profile-kv__label
  flex-shrink: 0
  width: 88px
  font-size: 15px
  color: var(--color-text)

.profile-kv__value
  flex: 1
  min-width: 0
  font-size: 15px
  text-align: right
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
  color: var(--color-text-secondary)

  &--mono
    font-family: monospace
    font-size: 14px

.profile-kv__icon
  color: rgba(60, 60, 67, 0.30)

.login-card
  padding: 20px 16px
  border-radius: 18px
  background: var(--color-card-bg)
  /* Карточка «плывёт» над стыком градиента и фона — как в макете */
  margin-top: -6px
  box-shadow: 0 12px 30px -12px rgba(1, 110, 215, 0.4)

.login-card__title
  font-size: 17px
  font-weight: 800
  letter-spacing: -0.3px
  margin: 0 0 14px
  color: var(--color-text)

.login-card__demo
  margin: 0 0 16px
  font-size: 14px
  line-height: 1.4
  color: var(--color-text-secondary)

.login-card__error
  margin: 0 0 12px
  font-size: 14px
  color: var(--color-danger, #c62828)

/* Нативные iOS-поля: filled без рамки, фокус подсвечивает синим */
.login-card :deep(.ui-input__field)
  height: 50px
  border-radius: 12px
  border-color: transparent
  background: rgba(118, 118, 128, 0.10)
  transition: background-color 0.15s ease, border-color 0.15s ease

.login-card :deep(.ui-input__field:focus-visible)
  background: #fff
  border-color: #016ED7

/* Крупная кнопка, «хочется нажать»: 52px + отклик на нажатие */
.login-card :deep(.ui-btn--lg)
  height: 52px
  border-radius: 14px
  font-size: 17px
  font-weight: 700
  margin-top: 4px
  transition: transform 0.1s ease, box-shadow 0.1s ease

.login-card :deep(.ui-btn--lg:active:enabled)
  transform: scale(0.97)
  box-shadow: 0 3px 10px -5px rgba(1, 110, 215, 0.6)

.register-form
  display: flex
  flex-direction: column
  gap: var(--spacing-3)
</style>
