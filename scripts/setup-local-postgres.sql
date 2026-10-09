-- Run in psql (or pgAdmin) as the postgres superuser:
--   psql -U postgres -f scripts/setup-local-postgres.sql
CREATE USER nielit WITH PASSWORD 'nielit_demo';
CREATE DATABASE nielit_portal OWNER nielit;
