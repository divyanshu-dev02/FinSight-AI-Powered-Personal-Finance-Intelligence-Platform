\set ON_ERROR_STOP on
BEGIN;

\ir ../backend/src/main/resources/demo/seed.sql
COMMIT;
