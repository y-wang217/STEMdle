#!/bin/bash
# Start a throwaway Postgres on localhost:5432 (user postgres / password postgres)
# with the two databases the test suites reset: mathdle_test (vitest) and
# mathdle_e2e (Playwright). Used by the SessionStart hook in cloud sessions and
# safe to run by hand. Usage: scripts/local-postgres.sh [stop]
set -euo pipefail

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
DATA="${PGDATA_DIR:-/tmp/stemdle-pg}"
if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "local-postgres: no Postgres server binaries found" >&2; exit 1
fi

as_pg() { if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }

if [ "${1:-}" = "stop" ]; then
  as_pg "$PGBIN/pg_ctl -D $DATA stop -m fast" >/dev/null 2>&1 || true
  exit 0
fi

if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  echo "local-postgres: already running"
else
  if [ ! -f "$DATA/PG_VERSION" ]; then
    mkdir -p "$DATA"
    [ "$(id -u)" = "0" ] && chown postgres:postgres "$DATA"
    echo postgres > /tmp/stemdle-pg-pw && chmod 644 /tmp/stemdle-pg-pw
    as_pg "$PGBIN/initdb -D $DATA -U postgres --pwfile=/tmp/stemdle-pg-pw -A md5 >/dev/null"
    rm -f /tmp/stemdle-pg-pw
  fi
  as_pg "$PGBIN/pg_ctl -D $DATA -l $DATA/log -o '-p 5432 -k /tmp' -w start >/dev/null"
fi

for db in mathdle_test mathdle_e2e; do
  PGPASSWORD=postgres psql -h localhost -U postgres -tAc "select 1 from pg_database where datname='$db'" | grep -q 1 \
    || PGPASSWORD=postgres psql -h localhost -U postgres -qc "create database $db"
done
echo "local-postgres: ready on localhost:5432 (mathdle_test, mathdle_e2e)"
