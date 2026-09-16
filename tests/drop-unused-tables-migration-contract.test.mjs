import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
    new URL('../public/api/migrations/026_erp_drop_unused_tables.sql', import.meta.url),
    'utf8',
)

test('миграция 026 безопасно убирает только устаревшие ручные таблицы стенда', () => {
    for (const table of ['erp_ed', 'erp_ks', 'erp_platforms', 'erp_report_month']) {
        assert.match(
            migration,
            new RegExp(`DROP\\s+TABLE\\s+IF\\s+EXISTS\\s+${table}\\s*;`, 'i'),
            `нет безопасного DROP TABLE IF EXISTS для ${table}`,
        )
    }

    assert.doesNotMatch(migration, /DELETE\s+FROM|UPDATE\s+/i)
})

test('миграция снимает только ручные внешние ключи площадок и не отключает проверки глобально', () => {
    for (const [table, key] of [
        ['erp_users', 'erp_users_ibfk_1'],
        ['erp_warehouse_stock', 'erp_warehouse_stock_ibfk_1'],
    ]) {
        assert.match(migration, new RegExp(`TABLE_NAME = '${table}'`))
        assert.match(migration, new RegExp(`CONSTRAINT_NAME = '${key}'`))
        assert.match(migration, new RegExp(`ALTER TABLE ${table} DROP FOREIGN KEY ${key}`))
    }

    assert.doesNotMatch(migration, /FOREIGN_KEY_CHECKS\s*=\s*0/i)
})
