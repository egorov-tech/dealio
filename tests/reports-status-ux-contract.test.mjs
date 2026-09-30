import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {loadTsModule} from './helpers/load-ts.mjs'

const badge = await readFile(new URL('../app/components/erp/ErpStatusBadge.vue', import.meta.url), 'utf8')
const ksPage = await readFile(new URL('../app/pages/reports-ks.vue', import.meta.url), 'utf8')
const idPage = await readFile(new URL('../app/pages/reports-id.vue', import.meta.url), 'utf8')
const {groupIdByContract, splitContractTitle} = await loadTsModule(new URL('../app/utils/erp-ks-id-grouping.ts', import.meta.url))

test('плашка статуса остаётся читаемой на телефоне, а не ужимается ради трёх колонок', () => {
    assert.match(badge, /min-height:\s*28px/)
    assert.match(badge, /font-size:\s*13px/)
    // Цвет заливки уже несёт смысл — жирный текст поверх него делал список шумным.
    assert.match(badge, /font-weight:\s*500/)
    assert.match(badge, /padding:\s*4px\s+10px/)
    assert.match(badge, /layout\?:\s*'chip'\s*\|\s*'row'/)
    assert.match(badge, /&--row/)
})

test('мобильные строки КС и ИД: статус полосой, без дублирующей подписи над плашкой', () => {
    for (const page of [ksPage, idPage]) {
        assert.match(page, /layout="row"/)
        assert.match(page, /grid-template-areas:/)
        assert.match(page, /content:\s*attr\(data-label\)/)
        assert.match(page, /splitContractTitle/)
        // Подпись «Статус» над самой плашкой дублировала текст внутри неё.
        assert.doesNotMatch(page, /data-label="Статус"/)
    }
})

test('splitContractTitle отделяет номер договора от заказчика', () => {
    assert.deepEqual(splitContractTitle('305 - Линия 3'), {
        code: '305',
        customer: 'Линия 3',
    })
    assert.deepEqual(splitContractTitle('301'), {code: '301', customer: ''})
    assert.deepEqual(splitContractTitle(''), {code: '—', customer: ''})
})

test('ИД показывает статусы в очереди отдела, а не в порядке загрузки строк', () => {
    const rows = [
        {contract: '305 - Линия 3', status: 'Подготовка', area: 1, amountWithVat: 10},
        {contract: '305 - Линия 3', status: 'Гарантийный объём', area: 1, amountWithVat: 10},
        {contract: '305 - Линия 3', status: 'Подписана', area: 1, amountWithVat: 10},
        {contract: '305 - Линия 3', status: 'На проверке СК', area: 1, amountWithVat: 10},
        {contract: '305 - Линия 3', status: 'Согласована', area: 1, amountWithVat: 10},
        {contract: '305 - Линия 3', status: 'Не хватает АВК', area: 1, amountWithVat: 10},
    ]

    assert.deepEqual(groupIdByContract(rows)[0].rows.map(row => row.status), [
        'Подписана',
        'Согласована',
        'На проверке СК',
        'Не хватает АВК',
        'Подготовка',
        'Гарантийный объём',
    ])
})
