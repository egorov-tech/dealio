import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const badge = await readFile(new URL('../app/components/erp/ErpStatusBadge.vue', import.meta.url), 'utf8')
const ksPage = await readFile(new URL('../app/pages/reports-ks.vue', import.meta.url), 'utf8')
const idPage = await readFile(new URL('../app/pages/reports-id.vue', import.meta.url), 'utf8')

test('плашка статуса остаётся читаемой на телефоне, а не ужимается ради трёх колонок', () => {
    assert.match(badge, /min-height:\s*28px/)
    assert.match(badge, /font-size:\s*14px/)
    assert.match(badge, /padding:\s*4px\s+10px/)
})

test('мобильные строки КС и ИД выводят статус отдельной полной строкой с подписью', () => {
    for (const page of [ksPage, idPage]) {
        assert.match(page, /data-label="Статус"/)
        assert.match(page, /grid-template-areas:/)
        assert.match(page, /content:\s*attr\(data-label\)/)
    }
})
