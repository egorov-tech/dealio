import type {ErpIdRow, ErpKsRow} from '~/utils/erp-api'

/**
 * Заголовок договора с API приходит как «305 - Линия 3».
 * На экране номер и наименование — разные уровни иерархии (как section header
 * в iOS), поэтому режем по первому « · », а не рисуем одной жирной строкой.
 */
export function splitContractTitle(contract: string): {code: string; customer: string} {
    const separator = ' - '
    const index = contract.indexOf(separator)
    if (index < 0) {
        return {code: contract.trim() || '—', customer: ''}
    }
    return {
        code: contract.slice(0, index).trim() || '—',
        customer: contract.slice(index + separator.length).trim(),
    }
}

/**
 * Группировка листов «КС»/«ИД» по договору — проще, чем groupReportRows для
 * «Лист 15»: тут ровно одно измерение группировки (договор), без выбора
 * между несколькими, и строка листа уже сама по себе строка группы, а не
 * пара «объект + измерение».
 */
export interface ErpKsGroup {
    contract: string
    rows: Array<{number: string; amountWithVat: number; status: string}>
    totalAmountWithVat: number
}

export function groupKsByContract(rows: ErpKsRow[]): ErpKsGroup[] {
    const groups: ErpKsGroup[] = []
    const indexByContract = new Map<string, number>()

    for (const row of rows) {
        let index = indexByContract.get(row.contract)
        if (index === undefined) {
            index = groups.length
            indexByContract.set(row.contract, index)
            groups.push({contract: row.contract, rows: [], totalAmountWithVat: 0})
        }
        groups[index].rows.push({number: row.number, amountWithVat: row.amountWithVat, status: row.status})
        groups[index].totalAmountWithVat += row.amountWithVat
    }

    return groups
}

export interface ErpIdGroup {
    contract: string
    rows: Array<{status: string; area: number; amountWithVat: number}>
}

/**
 * Строка листа «ИД» — отдельный акт (АОСР), а на экране договор
 * разворачивается строками статусов: «Подписана — столько-то площади на
 * столько-то рублей». Актов в договоре под две сотни, поэтому показывать их
 * поштучно бессмысленно — складываем площадь и стоимость по статусу.
 *
 * Порядок статусов — рабочая очередь отдела, согласованная в ТЗ. Источник
 * отдаёт записи в порядке создания, поэтому полагаться на него нельзя: новая
 * строка «Подготовка» иначе оказывалась выше уже подписанных документов.
 */
const ID_STATUS_ORDER = [
    'Подписана',
    'Согласована',
    'На проверке СГ',
    // В существующей базе используется «СК», а в новом ТЗ — «СГ». Обе
    // формулировки обозначают одну позицию очереди до нормализации данных.
    'На проверке СК',
    'На проверке ГСП',
    'Устранение замечаний',
    'Не хватает инспекций',
    'Не хватает Инспекций',
    'Не хватает АВК',
    'Подготовка',
    'Нет ПОЗ',
    'Гарантийный объём',
]

function idStatusPosition(status: string): number {
    const index = ID_STATUS_ORDER.indexOf(status)
    return index === -1 ? ID_STATUS_ORDER.length : index
}

export function groupIdByContract(rows: ErpIdRow[]): ErpIdGroup[] {
    const groups: ErpIdGroup[] = []
    const indexByContract = new Map<string, number>()

    for (const row of rows) {
        let index = indexByContract.get(row.contract)
        if (index === undefined) {
            index = groups.length
            indexByContract.set(row.contract, index)
            groups.push({contract: row.contract, rows: []})
        }

        const lines = groups[index].rows
        const line = lines.find(existing => existing.status === row.status)
        if (line) {
            line.area += row.area
            line.amountWithVat += row.amountWithVat
        } else {
            lines.push({status: row.status, area: row.area, amountWithVat: row.amountWithVat})
        }
    }

    for (const group of groups) {
        group.rows.sort((left, right) => idStatusPosition(left.status) - idStatusPosition(right.status))
    }

    return groups
}
