-- Раздел «ПТО»: собственные имена таблиц для ИД и КС.
--
-- Имена erp_ed и erp_ks на стенде оказались уже заняты таблицами стороннего
-- импорта (договор там связан через erp_contracts.contract_name, числа лежат
-- строками, служебных колонок нет). `CREATE TABLE IF NOT EXISTS` в миграции
-- 023 такие таблицы молча пропустил, сама миграция записалась как применённая,
-- и раздел падал на первом же запросе к базе.
--
-- Чужие таблицы здесь не переименовываются и не удаляются: то, что их
-- наполняет, продолжает работать. Раздел уходит в собственное пространство
-- имён erp_pto_*, а накопленные строки копируются в него один раз —
-- сопоставление договора идёт через уникальный erp_contracts.contract_name.
--
-- Ветвление сделано через PREPARE/EXECUTE: раннер режет файл по «;» и
-- процедуру с BEGIN ... END не соберёт, а таблиц импорта на чистой базе
-- (и на проде) нет вовсе — копировать там нечего.

CREATE TABLE IF NOT EXISTS erp_pto_ed (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    contract_internal_number VARCHAR(64) NOT NULL,

    aosr VARCHAR(255) NOT NULL DEFAULT '',
    title VARCHAR(255) NOT NULL DEFAULT '',
    -- Часть (захватка): DP2, DP4, DP6. В ТЗ раздела её нет, но она есть в
    -- живых данных, и без неё копирование теряло бы целую колонку.
    part VARCHAR(64) NOT NULL DEFAULT '',
    volume DECIMAL(15,3) NULL,
    cost DECIMAL(15,2) NULL,
    status VARCHAR(64) NOT NULL DEFAULT '',

    -- Тот же diff-приём, что у заявок снабжения и счетов (010, 019):
    -- уведомление шлётся по расхождению status <> notified_status.
    notified_status VARCHAR(64) NOT NULL DEFAULT '',

    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    KEY erp_pto_ed_contract_idx (contract_internal_number),
    KEY erp_pto_ed_notified_idx (notified_status, status),
    CONSTRAINT erp_pto_ed_contract_fk
        FOREIGN KEY (contract_internal_number) REFERENCES erp_contracts (internal_number)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT erp_pto_ed_author_fk
        FOREIGN KEY (created_by) REFERENCES erp_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_pto_ks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    contract_internal_number VARCHAR(64) NOT NULL,

    number VARCHAR(64) NOT NULL DEFAULT '',
    cost DECIMAL(15,2) NULL,
    status VARCHAR(64) NOT NULL DEFAULT '',

    notified_status VARCHAR(64) NOT NULL DEFAULT '',

    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    KEY erp_pto_ks_contract_idx (contract_internal_number),
    KEY erp_pto_ks_notified_idx (notified_status, status),
    CONSTRAINT erp_pto_ks_contract_fk
        FOREIGN KEY (contract_internal_number) REFERENCES erp_contracts (internal_number)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT erp_pto_ks_author_fk
        FOREIGN KEY (created_by) REFERENCES erp_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Копирование идёт один раз и только в пустую таблицу: повторный прогон
-- миграций не должен задваивать строки. Числа в импорте — строки с запятой,
-- CHAR(44)/CHAR(46) избавляют от кавычек внутри кавычек. Статус сразу
-- считаем сообщённым: это перенос истории, а не смена статуса — рассылать
-- по нему уведомления всему отделу нельзя.
SET @erp_pto_ed_source = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'erp_ed' AND COLUMN_NAME = 'contract_name'
);
SET @erp_pto_ed_ready = (SELECT COUNT(*) = 0 FROM erp_pto_ed);
SET @erp_pto_sql = IF(
    @erp_pto_ed_source > 0 AND @erp_pto_ed_ready,
    'INSERT INTO erp_pto_ed (contract_internal_number, aosr, title, part, volume, cost, status, notified_status)
     SELECT c.internal_number, i.aosr, i.title, i.part,
            IF(LENGTH(TRIM(i.volume)) = 0, NULL, CAST(REPLACE(i.volume, CHAR(44), CHAR(46)) AS DECIMAL(15,3))),
            IF(LENGTH(TRIM(i.cost)) = 0, NULL, CAST(REPLACE(i.cost, CHAR(44), CHAR(46)) AS DECIMAL(15,2))),
            i.status, i.status
     FROM erp_ed i
     JOIN erp_contracts c ON c.contract_name = i.contract_name
     ORDER BY i.id',
    'DO 0'
);
PREPARE erp_pto_stmt FROM @erp_pto_sql;
EXECUTE erp_pto_stmt;
DEALLOCATE PREPARE erp_pto_stmt;

SET @erp_pto_ks_source = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'erp_ks' AND COLUMN_NAME = 'contract_name'
);
SET @erp_pto_ks_ready = (SELECT COUNT(*) = 0 FROM erp_pto_ks);
SET @erp_pto_sql = IF(
    @erp_pto_ks_source > 0 AND @erp_pto_ks_ready,
    'INSERT INTO erp_pto_ks (contract_internal_number, number, cost, status, notified_status)
     SELECT c.internal_number, i.number,
            IF(LENGTH(TRIM(i.cost)) = 0, NULL, CAST(REPLACE(i.cost, CHAR(44), CHAR(46)) AS DECIMAL(15,2))),
            i.status, i.status
     FROM erp_ks i
     JOIN erp_contracts c ON c.contract_name = i.contract_name
     ORDER BY i.id',
    'DO 0'
);
PREPARE erp_pto_stmt FROM @erp_pto_sql;
EXECUTE erp_pto_stmt;
DEALLOCATE PREPARE erp_pto_stmt;
