-- Раздел «ПТО»: исполнительная документация (ИД) и акты форм КС.
--
-- Тот же приём связи с договором, что уже есть у ведомости работ (022):
-- внутренний номер, RESTRICT на удаление — потерять исполнительную
-- документацию или подписанный акт вместе с договором нельзя.
CREATE TABLE IF NOT EXISTS erp_ed (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    contract_internal_number VARCHAR(64) NOT NULL,

    aosr VARCHAR(255) NOT NULL DEFAULT '',
    title VARCHAR(255) NOT NULL DEFAULT '',
    volume DECIMAL(15,3) NULL,
    cost DECIMAL(15,2) NULL,
    -- Список статусов фиксирован в ТЗ и проверяется в PHP (erp_ed_statuses):
    -- 11 значений — не то, что стоит держать в ENUM, который меняется только
    -- миграцией. Строка + проверка в коде правится без миграции при следующей
    -- корректировке списка.
    status VARCHAR(64) NOT NULL DEFAULT '',

    -- Тот же diff-приём, что у заявок снабжения и счетов (010, 019):
    -- уведомление шлётся по расхождению status <> notified_status, а не по
    -- вызову из конкретного места — событие остаётся событием, даже если
    -- статус поменяли не через это API.
    notified_status VARCHAR(64) NOT NULL DEFAULT '',

    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    KEY erp_ed_contract_idx (contract_internal_number),
    KEY erp_ed_notified_idx (notified_status, status),
    CONSTRAINT erp_ed_contract_fk
        FOREIGN KEY (contract_internal_number) REFERENCES erp_contracts (internal_number)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT erp_ed_author_fk
        FOREIGN KEY (created_by) REFERENCES erp_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_ks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    contract_internal_number VARCHAR(64) NOT NULL,

    number VARCHAR(64) NOT NULL DEFAULT '',
    cost DECIMAL(15,2) NULL,
    -- Только два статуса по ТЗ: «Подписана» / «Согласована» (список — в
    -- erp_ks_statuses). Не путать с отчётом «КС» из Google-таблицы
    -- (reportsKs в scripts/erp-gas-webapp.js) — тот только читает внешний
    -- источник для сводки руководству и с этой таблицей не связан, здесь ПТО
    -- ведёт акты сам, это источник данных, а не витрина.
    status VARCHAR(64) NOT NULL DEFAULT '',

    notified_status VARCHAR(64) NOT NULL DEFAULT '',

    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    KEY erp_ks_contract_idx (contract_internal_number),
    KEY erp_ks_notified_idx (notified_status, status),
    CONSTRAINT erp_ks_contract_fk
        FOREIGN KEY (contract_internal_number) REFERENCES erp_contracts (internal_number)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT erp_ks_author_fk
        FOREIGN KEY (created_by) REFERENCES erp_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
