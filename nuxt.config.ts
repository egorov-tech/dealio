const baseURL = process.env.NUXT_APP_BASE_URL || '/'

export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',

    ssr: false,

    runtimeConfig: {
        public: {
            // IDs таблицы только из env — в публичном репо дефолтов быть не должно.
            erpSpreadsheetId: process.env.NUXT_PUBLIC_ERP_SPREADSHEET_ID || '',
            erpIssueSheetGid: process.env.NUXT_PUBLIC_ERP_ISSUE_SHEET_GID || '',
            erpSheetsApiKey: process.env.NUXT_PUBLIC_ERP_SHEETS_API_KEY || '',
            erpGasUrl: process.env.NUXT_PUBLIC_ERP_GAS_URL || '',
            warehouseGasUrl: process.env.NUXT_PUBLIC_WAREHOUSE_GAS_URL || '',
            erpBackendMode: process.env.NUXT_PUBLIC_ERP_BACKEND_MODE || 'gas',
            erpApiBase: process.env.NUXT_PUBLIC_ERP_API_BASE || '/api',
            // Публичное демо (GitHub Pages): логин без GAS/SQL, бирки из моков.
            erpDemoMode: process.env.NUXT_PUBLIC_ERP_DEMO_MODE === 'true',
        },
    },

    app: {
        baseURL: process.env.NUXT_APP_BASE_URL || '/',
        buildAssetsDir: process.env.NUXT_APP_BUILD_ASSETS_DIR || '/_nuxt/',
        head: {
            htmlAttrs: {lang: 'ru'},
            // Имя продукта, а не описание одного экрана: этой строкой браузер
            // подписывает push-уведомления, и «выдача бирок» устарела ещё до
            // склада, снабжения, договоров и согласований.
            title: 'Морфлот Технология',
            link: [
                {rel: 'icon', type: 'image/svg+xml', href: `${baseURL}favicon-mt.svg`},
                {rel: 'apple-touch-icon', href: `${baseURL}icon-192.png`},
                {rel: 'manifest', href: `${baseURL}manifest.json`},
            ],
            meta: [
                // Позиционирование одно во всём продукте — «цифровой контур
                // предприятия», а не «ERP-платформа».
                {name: 'description', content: 'Цифровой контур предприятия: бирки, промеры, упаковка, сдача, склад, снабжение, договоры и согласования'},
                {name: 'theme-color', content: '#016ED7'},
                {name: 'color-scheme', content: 'light'},
                {name: 'mobile-web-app-capable', content: 'yes'},
                {name: 'apple-mobile-web-app-capable', content: 'yes'},
                {name: 'apple-mobile-web-app-status-bar-style', content: 'default'},
            ],
        },
    },

    devtools: {
        enabled: false
    },

    modules: [
        '@nuxt/eslint',
        '@nuxt/icon',
        '@pinia/nuxt',
        '@nuxt/ui',
        '@vueuse/nuxt',

        [
            '@vee-validate/nuxt',
            {
                autoImports: true,
                componentNames: {
                    Form: 'VeeForm',
                    Field: 'VeeField',
                    FieldArray: 'VeeFieldArray',
                    ErrorMessage: 'VeeErrorMessage'
                }
            }
        ],

        [
            '@nuxtjs/google-fonts',
            {
                families: {
                    Inter: [400, 500, 600, 700],
                    'Roboto Mono': [500, 600]
                },
                display: 'swap',
                preload: true,
                subsets: ['latin', 'cyrillic']
            }
        ]
    ],

    css: [
        '@/assets/css/normalize.css',
        '@/assets/css/variables.css',
        '@/assets/css/toast-overrides.css',
        '@/assets/css/erp-theme.css',
    ],

    pinia: {
        storesDirs: ['./store/**']
    },

    nitro: {
        prerender: {
            // Иначе краулер принимает статический manifest.json (PWA) за
            // SPA-маршрут (ссылка на него есть в <head>) и затирает его HTML.
            ignore: [/manifest\.json$/],
        },
    },
})
