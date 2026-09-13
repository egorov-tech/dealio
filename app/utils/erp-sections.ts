import type {ErpAccessFlags} from '~~/types/erp.types'

/**
 * Разделы ERP — единственный список.
 *
 * Отсюда строятся и плитки на главном экране, и таб-бар. Раньше список жил в
 * двух местах и разошёлся: «Договоры» появились на плитках, а в таб-баре их не
 * было — раздел существовал, но добраться до него из нижнего меню было нельзя.
 *
 * Новый раздел добавляется одной записью здесь. Тест
 * `tests/erp-sections-contract.test.mjs` следит, чтобы список не разошёлся с
 * правами и с маршрутами, которые закрывает middleware.
 */
export interface ErpSection {
    /** Код права. Раздел видят только те, кому оно выдано. */
    key: keyof ErpAccessFlags
    /** Куда ведёт раздел с плитки и из таб-бара. */
    to: string
    /**
     * Все пути раздела. По ним подсвечивается активная вкладка: раздел из
     * нескольких экранов должен оставаться выделенным на каждом из них.
     */
    routes: string[]
    icon: string
    /** Название на плитке главного экрана. */
    label: string
    /** Название в таб-баре: там помещается одно короткое слово. */
    tabLabel: string
    /** Подпись под названием на плитке. */
    caption: string
    tone: string
}

export const ERP_SECTIONS: ErpSection[] = [
    {
        key: 'badges',
        to: '/workshop',
        routes: ['/workshop', '/badges', '/receipt', '/shift'],
        icon: 'heroicons:tag',
        label: 'Бирки',
        tabLabel: 'Бирки',
        caption: 'Выдать',
        tone: '#016ED7',
    },
    {
        key: 'measurements',
        to: '/scan-measurement',
        routes: ['/scan-measurement', '/measurement'],
        icon: 'heroicons:beaker',
        label: 'Промеры',
        tabLabel: 'Промеры',
        caption: 'Считать',
        tone: '#2FB463',
    },
    {
        key: 'packing',
        to: '/scan-qr',
        routes: ['/scan-qr'],
        icon: 'heroicons:qr-code',
        label: 'Упаковка',
        tabLabel: 'Упаковка',
        caption: 'QR-скан',
        tone: '#E7920B',
    },
    {
        key: 'handover',
        to: '/scan-handover',
        routes: ['/scan-handover', '/handover-shift'],
        icon: 'heroicons:check-badge',
        label: 'Сдача',
        tabLabel: 'Сдача',
        caption: 'Приёмка',
        tone: '#8E4EC6',
    },
    {
        key: 'reports',
        to: '/reports',
        routes: ['/reports', '/reports-month', '/reports-full', '/reports-ks', '/reports-id'],
        icon: 'heroicons:chart-bar',
        label: 'Отчёты',
        tabLabel: 'Отчёты',
        caption: 'Оперативный срез',
        tone: '#016ED7',
    },
    {
        key: 'approvals',
        to: '/approvals',
        routes: ['/approvals'],
        icon: 'heroicons:check-circle',
        label: 'Согласования',
        tabLabel: 'Счета',
        caption: 'Счета',
        tone: '#0F766E',
    },
    {
        key: 'orders',
        to: '/supply',
        routes: ['/supply', '/supply-requests'],
        icon: 'heroicons:clipboard-document-check',
        label: 'Заказ снабжения',
        tabLabel: 'Заказ',
        caption: 'Заявка на материалы',
        tone: '#B45309',
    },
    {
        key: 'supply',
        to: '/supply-work',
        routes: ['/supply-work', '/invoice-new', '/invoices', '/supply-catalog', '/supply-requests-queue'],
        icon: 'heroicons:briefcase',
        label: 'Заявки и счета',
        tabLabel: 'Снабжение',
        caption: 'Заявки, счета и справочник',
        tone: '#0F766E',
    },
    {
        key: 'warehouse',
        to: '/warehouse',
        routes: ['/warehouse', '/warehouse-receive', '/warehouse-issue', '/warehouse-balance'],
        icon: 'heroicons:archive-box',
        label: 'Склад',
        tabLabel: 'Склад',
        caption: 'Приём/выдача',
        tone: '#4F46E5',
    },
    {
        key: 'contracts',
        to: '/contracts',
        routes: ['/contracts', '/contract-new', '/contract', '/contract-rates'],
        icon: 'heroicons:document-duplicate',
        label: 'Договоры',
        tabLabel: 'Договоры',
        caption: 'Договоры и расценки',
        tone: '#7C3AED',
    },
    {
        key: 'intake',
        to: '/intake',
        routes: ['/intake', '/intake-objects', '/intake-unmatched'],
        icon: 'heroicons:truck',
        label: 'Приход',
        tabLabel: 'Приход',
        caption: 'Приёмка объектов',
        tone: '#0EA5E9',
    },
    {
        key: 'personnel',
        to: '/personnel',
        routes: ['/personnel'],
        icon: 'heroicons:user-group',
        label: 'Кадры',
        tabLabel: 'Кадры',
        caption: 'Структуры и доступы',
        tone: '#016ED7',
    },
    {
        key: 'project_data',
        to: '/pto',
        routes: ['/pto', '/pto-ed', '/pto-ks', '/pto-work-statements'],
        icon: 'heroicons:clipboard-document-list',
        label: 'ПТО',
        tabLabel: 'ПТО',
        caption: 'ИД, КС, ведомость работ',
        tone: '#7C3AED',
    },
]

/** Разделы, доступные сотруднику. */
export function erpSectionsFor(access: ErpAccessFlags): ErpSection[] {
    return ERP_SECTIONS.filter(section => access[section.key])
}

/**
 * Раздел, которому принадлежит открытый экран.
 *
 * Конечный слэш срезаем: прямой переход по ссылке и обновление страницы дают
 * `/personnel/`, и без нормализации вкладка раздела гасла — снаружи выглядело
 * так, будто ничего не выбрано. Та же нормализация стоит в middleware.
 */
export function erpSectionForRoute(path: string): ErpSection | undefined {
    const normalized = path.length > 1 ? path.replace(/\/$/, '') : path
    return ERP_SECTIONS.find(section => section.routes.includes(normalized))
}
