import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const page = await readFile(new URL('../app/pages/personnel.vue', import.meta.url), 'utf8')
const screen = await readFile(new URL('../app/components/erp/ErpScreen.vue', import.meta.url), 'utf8')
const table = await readFile(new URL('../app/components/erp/ErpPersonnelEmployeeTable.vue', import.meta.url), 'utf8')
const actionSheet = await readFile(new URL('../app/components/erp/ErpActionSheet.vue', import.meta.url), 'utf8')
const theme = await readFile(new URL('../app/assets/css/erp-theme.css', import.meta.url), 'utf8')
const sections = await readFile(new URL('../app/utils/erp-sections.ts', import.meta.url), 'utf8')
const layout = await readFile(new URL('../app/layouts/erp.vue', import.meta.url), 'utf8')
const returnToDepartmentsStart = page.indexOf('const returnToDepartments = () =>')
const returnToDepartmentsEnd = page.indexOf('const openEmployee', returnToDepartmentsStart)
const returnToDepartments = page.slice(returnToDepartmentsStart, returnToDepartmentsEnd)

test('Personnel is an active hub tile without development copy', () => {
  // Плитка описана в общем реестре разделов, оттуда её берут и главный
  // экран, и таб-бар.
  const personnelTile = sections.match(/\{[^{}]*key: 'personnel'[\s\S]*?\}/)?.[0] ?? ''
  assert.doesNotMatch(personnelTile, /В разработке/)
  assert.match(personnelTile, /label: 'Кадры'/)
})

test('Personnel back control invokes the department reset instead of routing to the same page', () => {
  assert.match(page, /onClick: returnToDepartments/)
  assert.match(screen, /shiftLink\.onClick/)
  assert.match(screen, /@click="shiftLink\.onClick"/)
  assert.match(returnToDepartments, /selectedDepartment\.value = ''/)
  assert.doesNotMatch(returnToDepartments, /loadDepartments\(\)/)
})

test('employee card sheet scrolls within the viewport while the page behind stays locked', () => {
  assert.match(actionSheet, /max-height: min\(96dvh/)
  assert.match(actionSheet, /isTabBarHidden/)
  assert.match(actionSheet, /\.erp-sheet-form[\s\S]*overflow-y: auto/)
  assert.match(actionSheet, /document\.body\.style\.overflow = value \? 'hidden' : ''/)
  // Шторка на body — иначе fixed ломается внутри .erp-layout (overflow/flex)
  assert.match(actionSheet, /<Teleport to="body">/)
  // Токены палитры должны жить и на .erp-sheet-root (Teleport вне .erp-layout)
  assert.match(theme, /\.erp-layout,\s*\n\.erp-sheet-root\s*\{/)
  assert.match(theme, /\.erp-sheet-root \.ui-btn/)
})

test('Personnel hides chrome while a sheet is open', () => {
  assert.match(page, /isSheetOpen/)
  assert.match(page, /:head-compact="isSheetOpen"/)
  assert.match(page, /:footer-hidden="isSheetOpen"/)
  assert.match(screen, /headCompact/)
  assert.match(screen, /erp-screen--sheet-open/)
})

test('ERP mobile shell keeps scroll inside screen areas, not on document', () => {
  assert.match(layout, /htmlAttrs: \{class: 'erp-shell'\}/)
  assert.match(layout, /\.erp-layout[\s\S]*overflow: hidden/)
  assert.match(layout, /\.erp-layout__content[\s\S]*overflow: hidden/)
  assert.match(screen, /\.erp-screen[\s\S]*overflow: hidden/)
  assert.match(screen, /appearance: none/)
  assert.match(screen, /touch-action: manipulation/)
})

test('employee rows visibly communicate that the card opens on click', () => {
  assert.match(table, /ErpListRow/)
  assert.match(table, /chevron/)
  assert.match(table, /heroicons:chevron-right|chevron/)
  assert.match(table, /Открыть карточку/)
})

test('Personnel stays active after a canonical trailing-slash refresh', () => {
  // Подсветка раздела держится на списке маршрутов из общего реестра, а
  // конечный слэш срезается в erpSectionForRoute — прямой переход по ссылке
  // и обновление страницы дают «/personnel/».
  assert.match(sections, /routes: \['\/personnel'\]/)
  assert.match(sections, /path\.replace\(\/\\\/\$\/, ''\)/)
})
