<script lang="ts">
// Счётчик открытых шторок — на уровне модуля, иначе несколько экземпляров
// на странице (карточка + confirm) каждый держат свой 0 и ломают tab bar.
let openSheetCount = 0
</script>

<script setup lang="ts">
import {useTabBarHidden} from '~/composables/useTabBarHidden'

const props = defineProps<{
  open: boolean
  busy: boolean
  ariaLabel: string
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const isTabBarHidden = useTabBarHidden()

const syncTabBarHidden = () => {
    isTabBarHidden.value = openSheetCount > 0
}

watch(() => props.open, (value) => {
    if (import.meta.client) {
        document.body.style.overflow = value ? 'hidden' : ''
    }
}, {immediate: true})

watch(() => props.open, (value, wasOpen) => {
    if (value === wasOpen) return
    if (value) openSheetCount += 1
    else openSheetCount = Math.max(0, openSheetCount - 1)
    syncTabBarHidden()
}, {immediate: true})

onBeforeUnmount(() => {
    if (import.meta.client) document.body.style.overflow = ''
    if (props.open) {
        openSheetCount = Math.max(0, openSheetCount - 1)
        syncTabBarHidden()
    }
})

const dismiss = () => {
    if (props.busy) return
    emit('dismiss')
}

const onEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') dismiss()
}

onMounted(() => document.addEventListener('keydown', onEscape))
onBeforeUnmount(() => document.removeEventListener('keydown', onEscape))

// Свайп вниз по ручке шторки — закрывает попап, как системные шторки
// в iOS/Android. Ниже порога — отпружинивает обратно.
const DISMISS_THRESHOLD = 90

const isDragging = ref(false)
const dragY = ref(0)
let dragStartY = 0

const panelStyle = computed(() => isDragging.value
    ? {transform: `translateY(${dragY.value}px)`, transition: 'none'}
    : undefined,
)

const onDragStart = (event: PointerEvent) => {
    if (props.busy) return
    isDragging.value = true
    dragStartY = event.clientY
    dragY.value = 0
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
}

const onDragMove = (event: PointerEvent) => {
    dragY.value = Math.max(0, event.clientY - dragStartY)
}

const onDragEnd = () => {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
    isDragging.value = false

    if (dragY.value > DISMISS_THRESHOLD) {
        dismiss()
    }

    dragY.value = 0
}
</script>

<template>
  <!--
    INVARIANT: шторка только через Teleport → body.
    Внутри .erp-layout у неё ломается position:fixed (overflow/clip + flex:1
    на прямых детях контента) — карточка «улетает» при открытии с бирки.
  -->
  <Teleport to="body">
    <Transition name="erp-sheet">
      <div v-if="open" class="erp-sheet-root">
        <div class="erp-sheet-backdrop" aria-hidden="true" @click="dismiss"/>

        <div
            class="erp-sheet-panel"
            role="dialog"
            aria-modal="true"
            :aria-label="ariaLabel"
            :style="panelStyle"
        >
          <div class="erp-sheet-grip" @pointerdown="onDragStart">
            <span class="erp-sheet-handle"/>
          </div>

          <p v-if="$slots.label" class="erp-sheet-label"><slot name="label"/></p>

          <article v-if="$slots.content" class="erp-sheet-card">
            <p class="erp-sheet-content"><slot name="content"/></p>
          </article>

          <p v-if="$slots.meta" class="erp-sheet-meta"><slot name="meta"/></p>
          <Transition name="erp-sheet-error">
            <p v-if="$slots.error" class="erp-sheet-error"><slot name="error"/></p>
          </Transition>

          <div v-if="$slots.form" class="erp-sheet-form">
            <slot name="form"/>
          </div>

          <div v-if="$slots.actions" class="erp-sheet-actions">
            <slot name="actions"/>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="sass">
.erp-sheet-root
  position: fixed
  inset: 0
  z-index: var(--z-index-modal)
  display: flex
  align-items: flex-end
  justify-content: center
  // Явный цвет — шторка на body вне .erp-layout (см. erp-theme invariant)
  color: #1C2530

.erp-sheet-backdrop
  position: absolute
  inset: 0
  background-color: rgba(0, 0, 0, 0.52)

.erp-sheet-panel
  position: relative
  width: 100%
  max-width: 480px
  // Почти весь экран на iPhone — иначе за шторкой остаётся шапка/footer и
  // кажется, что «всё перекрывается».
  max-height: min(96dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 6px))
  min-height: min(72dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 6px))
  display: flex
  flex-direction: column
  align-items: stretch
  gap: 8px
  padding: 0 16px calc(12px + env(safe-area-inset-bottom, 0px))
  box-sizing: border-box
  background-color: #F2F2F7
  border: none
  border-bottom: none
  border-radius: 18px 18px 0 0
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12)
  overflow: hidden
  will-change: transform

.erp-sheet-grip
  display: flex
  justify-content: center
  width: 100%
  padding: var(--spacing-3) 0
  touch-action: none
  cursor: grab

.erp-sheet-handle
  width: 36px
  height: 4px
  border-radius: var(--radius-full)
  background-color: var(--color-border)

.erp-sheet-label
  margin: 0
  padding: 0 4px
  font-size: 13px
  font-weight: 400
  color: var(--color-text-secondary)

.erp-sheet-card
  width: 100%
  box-sizing: border-box
  padding: 16px
  border: none
  border-radius: 13px
  background-color: var(--color-card-bg)
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04)

.erp-sheet-content
  margin: 0
  font-size: 17px
  font-weight: 600
  line-height: 1.35
  color: var(--color-text)
  text-align: center
  white-space: pre-line
  overflow-wrap: anywhere

.erp-sheet-meta
  margin: 0
  padding: 0 4px
  font-size: 13px
  text-align: center
  color: var(--color-text-secondary)

.erp-sheet-error
  margin: 0
  padding: 12px 14px
  width: 100%
  box-sizing: border-box
  border-radius: 13px
  background-color: rgba(255, 59, 48, 0.10)
  color: #FF3B30
  font-size: 15px
  line-height: 1.4

.erp-sheet-error-enter-active,
.erp-sheet-error-leave-active
  transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.22s ease

.erp-sheet-error-enter-from,
.erp-sheet-error-leave-to
  transform: translateY(-6px)
  opacity: 0

.erp-sheet-form
  display: flex
  flex-direction: column
  gap: var(--spacing-3)
  width: 100%
  flex: 1 1 auto
  min-height: 0
  overflow-x: hidden
  overflow-y: auto
  -webkit-overflow-scrolling: touch
  overscroll-behavior: contain
  touch-action: pan-y

.erp-sheet-actions
  display: flex
  flex-direction: column
  gap: 8px
  width: 100%
  margin-top: 4px
  flex-shrink: 0

// Своя, более заметная длительность — только для этой шторки (не трогаем
// общий --erp-motion-duration, которым делятся тосты и другие панели).
.erp-sheet-enter-active,
.erp-sheet-leave-active
  .erp-sheet-backdrop
    transition: opacity 0.36s var(--erp-motion-ease)

  .erp-sheet-panel
    transition: transform 0.36s var(--erp-motion-ease)

.erp-sheet-enter-from,
.erp-sheet-leave-to
  .erp-sheet-backdrop
    opacity: 0

  .erp-sheet-panel
    transform: translateY(100%)
</style>
