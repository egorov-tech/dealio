#!/usr/bin/env bash
# Сводная проверка стенда после выкатки.
#
# Отвечает на вопрос «всё ли доехало и всё ли закрыто» одним прогоном:
# та ли версия на сайте, не торчат ли наружу внутренности API, живы ли
# маршруты, чист ли репозиторий. Пост-деплойный шаг CI проверяет часть того
# же самого, но этот скрипт можно запустить руками в любой момент.
#
#   bash scripts/staging-audit.sh [URL]
#
# Без аргумента проверяется стенд.
set -uo pipefail

BASE="${1:-https://erp-mt.online}"
BASE="${BASE%/}"
cd "$(dirname "$0")/.." || exit 1

fail=0
ok()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=1; }

echo "── Версия ──"
git fetch -q origin 2>/dev/null
want=$(git rev-parse origin/main 2>/dev/null || echo '')
got=$(curl -fsS --retry 3 --retry-delay 2 "$BASE/release.txt" 2>/dev/null | tr -d '[:space:]')
if [ -z "$got" ]; then
    bad "release.txt не читается — сайт недоступен?"
elif [ "$want" = "$got" ]; then
    ok "release.txt = origin/main (${got:0:7})"
else
    bad "на сайте ${got:0:7}, в origin/main ${want:0:7}"
fi

echo "── Внутренности API закрыты ──"
# Всё из public/ отдаётся статикой, поэтому исходники, схема базы и список
# зависимостей обязаны быть недоступны. Закрывает их public/api/.htaccess.
paths=(api/src/Auth.php api/vendor/autoload.php api/composer.json api/composer.lock api/.user.ini)
last_migration=$(ls -1 public/api/migrations 2>/dev/null | tail -1)
[ -n "$last_migration" ] && paths+=("api/migrations/$last_migration")
for p in "${paths[@]}"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$p")
    if [ "$code" = "404" ] || [ "$code" = "403" ]; then
        ok "$p -> $code"
    else
        bad "$p -> $code (доступен наружу!)"
    fi
done

echo "── Маршруты живы (401/403 = код на месте) ──"
for route in supply/catalog supply/my-requests; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/$route")
    [ "$code" = "401" ] && ok "GET /api/$route -> 401" || bad "GET /api/$route -> $code"
done
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/internal/supply-notify-status")
[ "$code" = "403" ] && ok "крон-маршрут без токена -> 403" || bad "крон-маршрут -> $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/internal/pto-notify-status")
[ "$code" = "403" ] && ok "крон-маршрут ПТО без токена -> 403" || bad "крон-маршрут ПТО -> $code"

echo "── Репозиторий ──"
[ -z "$(git status --porcelain)" ] && ok "рабочее дерево чистое" || bad "есть незакоммиченное"
if command -v gh >/dev/null 2>&1; then
    open_prs=$(gh pr list --state open --json number --jq 'length' 2>/dev/null || echo '?')
    [ "$open_prs" = "0" ] && ok "открытых PR нет" || bad "открытых PR: $open_prs"
fi

echo
if [ $fail -eq 0 ]; then echo "ИТОГ: всё чисто"; else echo "ИТОГ: есть проблемы"; fi
exit $fail
