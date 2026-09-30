import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const summary = await readFile(new URL('../app/components/erp/ErpReportsSummary.vue', import.meta.url), 'utf8')
const month = await readFile(new URL('../app/components/erp/ErpReportsTable.vue', import.meta.url), 'utf8')
const full = await readFile(new URL('../app/pages/reports-full.vue', import.meta.url), 'utf8')
const ks = await readFile(new URL('../app/pages/reports-ks.vue', import.meta.url), 'utf8')
const id = await readFile(new URL('../app/pages/reports-id.vue', import.meta.url), 'utf8')

const cssRule = (source, selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = source.match(new RegExp(`${escaped}\\n((?:  [^\\n]*\\n)+)`))
    assert.ok(match, `не найдено CSS-правило ${selector}`)
    return match[1]
}

test('сводные показатели отчёта всегда стоят в двух строгих колонках', () => {
    // Нельзя оставлять auto-fit: при иной ширине карточки показатель внезапно
    // прыгает рядом с другим, и числовой столбец глазами уже не найти.
    const metric = cssRule(summary, '.erp-reports-summary__metric')
    assert.match(metric, /grid-template-columns: minmax\(0, 1fr\) auto/)
    const value = cssRule(summary, '.erp-reports-summary__value')
    assert.match(value, /text-align: right/)
    assert.match(value, /font-variant-numeric: tabular-nums/)
})

test('детализация месяца и полного отчёта не раскладывает метрики по ширине карточки', () => {
    for (const [name, source, metricsSelector, metricSelector] of [
        ['месячный', month, '.erp-reports-table__metrics', '.erp-reports-table__metric'],
        ['полный', full, '.full-report-table__metrics', '.full-report-table__metric'],
    ]) {
        const metrics = cssRule(source, metricsSelector)
        const metric = cssRule(source, metricSelector)
        assert.match(metrics, /grid-template-columns: 1fr/, `${name}: метрики должны идти одной строкой на показатель`)
        assert.match(metric, /grid-template-columns: minmax\(0, 1fr\) auto/, `${name}: строка — подпись и значение`)
        assert.match(
            source,
            new RegExp(`${metricSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?dd[\\s\\S]*?font-variant-numeric: tabular-nums`),
            `${name}: цифры должны выравниваться разрядами`,
        )
    }
})

test('таблицы всех блоков раздела держат колонки долями, а не по содержимому', () => {
    // auto подгоняет колонку под самое длинное число внутри карточки, и у
    // соседних договоров столбцы получаются разной ширины — на телефоне это
    // видно как уступ. Доли держат общий столбец во всех блоках сразу.
    for (const [name, source] of [
        ['месячный', month],
        ['полный', full],
        ['КС', ks],
        ['ИД', id],
    ]) {
        const grids = source.match(/grid-template-columns: [^\n]+/g) ?? []
        // Строка «подпись — значение» из двух колонок не в счёт: там auto
        // прижимает число к правому краю карточки, и общий край как раз
        // получается. Съезжают таблицы от трёх колонок.
        const tableGrids = grids.filter(rule => (rule.match(/minmax\(|\bauto\b/g) ?? []).length >= 3)
        assert.ok(tableGrids.length > 0, `${name}: не найдено ни одной таблицы`)
        for (const rule of tableGrids) {
            assert.doesNotMatch(rule, /\bauto\b/, `${name}: колонка по содержимому — «${rule.trim()}»`)
        }
    }
})

test('числа в таблицах не переносятся по разрядам', () => {
    // Перенос делает строку выше, и блоки съезжают по вертикали даже при
    // одинаковых колонках.
    for (const [name, source] of [
        ['месячный', month],
        ['полный', full],
        ['ИД', id],
    ]) {
        assert.match(source, /white-space: nowrap/, `${name}: числовые ячейки должны быть в одну строку`)
    }
    // В КС статус вынесен в отдельную мобильную строку, поэтому запрет нужен
    // только сумме, а не «второму span» старой табличной разметки.
    const ksAmount = cssRule(ks, '.ks-group__amount')
    assert.match(ksAmount, /white-space: nowrap/, 'КС: сумма должна оставаться в одну строку')
})
