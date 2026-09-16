-- Эти четыре таблицы были заведены на стенде вручную, мимо миграций и API.
-- Данные ИД/КС уже перенесены миграцией 024 в собственные таблицы ПТО.
--
-- На историческом staging у erp_platforms есть две ручные внешние связи:
-- erp_users.platform и erp_warehouse_stock.platform. Их нет ни в одной
-- миграции и рантайм не использует этот справочник: список площадок склада
-- формируется из erp_warehouse_stock. Снимаем только эти известные связи и
-- только если они существуют. Глобальный FOREIGN_KEY_CHECKS здесь опасен:
-- он спрятал бы ошибку в любой другой зависимости.
SET @erp_drop_platform_fk = (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'erp_users'
      AND CONSTRAINT_NAME = 'erp_users_ibfk_1'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @erp_drop_platform_sql = IF(
    @erp_drop_platform_fk > 0,
    'ALTER TABLE erp_users DROP FOREIGN KEY erp_users_ibfk_1',
    'DO 0'
);
PREPARE erp_drop_platform_stmt FROM @erp_drop_platform_sql;
EXECUTE erp_drop_platform_stmt;
DEALLOCATE PREPARE erp_drop_platform_stmt;

SET @erp_drop_platform_fk = (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'erp_warehouse_stock'
      AND CONSTRAINT_NAME = 'erp_warehouse_stock_ibfk_1'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @erp_drop_platform_sql = IF(
    @erp_drop_platform_fk > 0,
    'ALTER TABLE erp_warehouse_stock DROP FOREIGN KEY erp_warehouse_stock_ibfk_1',
    'DO 0'
);
PREPARE erp_drop_platform_stmt FROM @erp_drop_platform_sql;
EXECUTE erp_drop_platform_stmt;
DEALLOCATE PREPARE erp_drop_platform_stmt;

-- IF EXISTS сохраняет чистую установку и повторную проверку безопасными.
DROP TABLE IF EXISTS erp_ed;
DROP TABLE IF EXISTS erp_ks;
DROP TABLE IF EXISTS erp_report_month;
DROP TABLE IF EXISTS erp_platforms;
