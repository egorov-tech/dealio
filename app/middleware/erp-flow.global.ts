import {useErpEmployeeStore} from '~~/store/erp-employee.store'
import {useErpSessionStore} from '~~/store/erp-session.store'

const ERP_ROUTES = new Set([
    '/register',
    '/workshop',
    '/badges',
    '/receipt',
    '/shift',
    '/scan-qr',
    '/scan-handover',
    '/handover-shift',
    '/scan-measurement',
    '/measurement',
    '/reports',
    '/reports-month',
    '/reports-full',
    '/reports-ks',
    '/reports-id',
    '/approvals',
    '/supply',
    '/supply-requests',
    '/supply-work',
    '/invoice-new',
    '/invoices',
    '/supply-catalog',
    '/supply-requests-queue',
    '/contracts',
    '/contract-new',
    '/contract',
    '/contract-rates',
    '/warehouse',
    '/warehouse-receive',
    '/warehouse-issue',
    '/warehouse-balance',
    '/notifications-guide',
    '/personnel',
    '/intake',
    '/intake-objects',
    '/intake-unmatched',
    '/pto',
    '/pto-ed',
    '/pto-ks',
    '/pto-work-statements',
])

export default defineNuxtRouteMiddleware((to) => {
    // Прямая навигация и обновление страницы могут дать конечный слэш
    // (например /badges/) — без нормализации сравнения ниже не сработают.
    const path = to.path.length > 1 ? to.path.replace(/\/$/, '') : to.path

    const employeeStore = useErpEmployeeStore()
    const sessionStore = useErpSessionStore()

    if (path === '/') {
        return navigateTo('/register')
    }

    if (!ERP_ROUTES.has(path)) {
        return
    }

    // /register — общий хаб: ФИО уже подставлено из профиля, а кнопки
    // «Бирки»/«Упаковки» ведут в разные потоки, поэтому редиректа отсюда нет.
    if (path === '/register') {
        return
    }

    if (!employeeStore.hasFio) {
        return navigateTo('/register')
    }

    const ACCESS_GUARDED: Record<string, keyof typeof employeeStore.access> = {
        '/scan-measurement': 'measurements',
        '/measurement': 'measurements',
        '/scan-handover': 'handover',
        '/handover-shift': 'handover',
        '/reports': 'reports',
        '/reports-month': 'reports',
        '/reports-full': 'reports',
        '/reports-ks': 'reports',
        '/reports-id': 'reports',
        '/approvals': 'approvals',
        // Заявку на материалы создаёт цех — это право «Заказ снабжения»
        // (orders), оно есть у 36 сотрудников из 43. Право «Работа со
        // снабжением» (supply) — у шести снабженцев, и оно закрывает счета.
        '/supply': 'orders',
        '/supply-requests': 'orders',
        '/supply-work': 'supply',
        '/invoice-new': 'supply',
        '/invoices': 'supply',
        '/supply-catalog': 'supply',
        '/supply-requests-queue': 'supply',
        '/contracts': 'contracts',
        '/contract-new': 'contracts',
        '/contract': 'contracts',
        '/contract-rates': 'contracts',
        '/warehouse': 'warehouse',
        '/warehouse-receive': 'warehouse',
        '/warehouse-issue': 'warehouse',
        '/warehouse-balance': 'warehouse',
        '/personnel': 'personnel',
        '/intake': 'intake',
        '/intake-objects': 'intake',
        '/intake-unmatched': 'intake',
        '/pto': 'project_data',
        '/pto-ed': 'project_data',
        '/pto-ks': 'project_data',
        '/pto-work-statements': 'project_data',
    }

    const guardedFlag = ACCESS_GUARDED[path]
    if (guardedFlag !== undefined) {
        if (!employeeStore.access[guardedFlag]) {
            return navigateTo('/register')
        }
        return
    }

    // Бирки (/workshop, /badges, /receipt, /shift) требуют access.badges;
    // упаковка (/scan-qr) — access.packing. Таб-бар уже прячет эти разделы
    // без доступа, но прямой переход по URL раньше не проверялся вовсе.
    const BADGES_ROUTES = new Set(['/workshop', '/badges', '/receipt', '/shift'])
    if (BADGES_ROUTES.has(path) && !employeeStore.access.badges) {
        return navigateTo('/register')
    }
    if (path === '/scan-qr' && !employeeStore.access.packing) {
        return navigateTo('/register')
    }

    // /scan-qr не требует выбора цеха — упаковка пишет площадку из профиля
    // сотрудника напрямую, отдельного экрана выбора цеха для неё нет.
    // /notifications-guide — общая справка, доступна любому вошедшему
    // сотруднику независимо от цеха/прав доступа к разделам.
    if (path === '/workshop' || path === '/shift' || path === '/scan-qr' || path === '/notifications-guide') {
        return
    }

    if (!employeeStore.hasWorkshop) {
        return navigateTo('/workshop')
    }

    if (path === '/receipt' && !sessionStore.hasSelectedBadge) {
        return navigateTo('/badges')
    }
})
