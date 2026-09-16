<script setup lang="ts">
/**
 * Цветная плашка статуса ИД/КС — палитра и порядок цветов заданы ТЗ
 * «Раздел Отчёты — ИД и КС: изменение источников и цветовая индикация».
 *
 * Статус вне палитры (например «На согласовании» у КС, «Забрал ВЛС» и
 * «Гарантийный объём» у ИД — их нет в ТЗ, но записи с ними реально есть в
 * базе) не остаётся без цвета: нейтральный тон, а не пустая ошибка на
 * экране отчётов.
 */
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

const props = defineProps<{status: string}>()
const tone = computed(() => STATUS_TONE[props.status] ?? 'neutral')
</script>

<template>
  <span class="erp-status-badge" :class="`erp-status-badge--${tone}`">{{ status || '—' }}</span>
</template>

<style scoped lang="sass">
.erp-status-badge
  box-sizing: border-box
  display: inline-flex
  align-items: center
  max-width: 100%
  min-height: 28px
  padding: 4px 10px
  border-radius: 999px
  // Плашка — самостоятельный смысловой элемент, а не мелкая подпись в
  // таблице: на узком экране строка перестраивается, и ужимать статус ради
  // колонок не нужно. При этом смысл несёт цвет заливки, а не вес текста —
  // жирное начертание спорило с ним и делало список шумным.
  font-size: 13px
  font-weight: 500
  line-height: 1.35
  text-align: center
  // Перенос только по границе слова, и оба свойства заданы явно: они
  // наследуемые, а колонки таблиц вокруг любят ставить себе
  // overflow-wrap: anywhere ради длинных шифров. Унаследовав его, плашка
  // рвала статус посреди слова («Устранени/е»).
  overflow-wrap: normal
  word-break: normal
  // Тёмные чернила держат контраст на всех шести заливках, включая самую
  // насыщенную (#ed7d31): белый текст на ней даёт 2,8:1 и нечитаем — тот же
  // вывод, что и у карточек ИД в разделе «ПТО» (app/pages/pto-ed.vue).
  color: #16202e

  // Заливки — из ТЗ. Контур подобран темнее той же краски: карточка отчёта
  // белая, но плашка должна оставаться различимой и на самом бледном тоне
  // («На проверке» #d9e1f2 иначе почти сливается с белым полем).
  &--ok
    background: #e2efda
    border: 1px solid #a3cd8e

  &--info
    background: #d9e1f2
    border: 1px solid #94afd9

  &--warn
    background: #fff2cc
    border: 1px solid #e3c25c

  &--alert
    background: #ed7d31
    border: 1px solid #bd5a13

  &--done
    background: #a9d08e
    border: 1px solid #6ea555

  &--neutral
    background: #ffffff
    border: 1px solid rgba(60, 60, 67, 0.18)
</style>
