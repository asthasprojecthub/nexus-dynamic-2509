-- Run this once as a PostgreSQL superuser (for example from pgAdmin Query Tool).
-- Change the password before using this outside local development.
CREATE ROLE nexus_app WITH LOGIN PASSWORD 'ChangeThisPassword';
CREATE DATABASE nexus_dashboard OWNER nexus_app;
GRANT ALL PRIVILEGES ON DATABASE nexus_dashboard TO nexus_app;
