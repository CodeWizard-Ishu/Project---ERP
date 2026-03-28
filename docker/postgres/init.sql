-- ERP System Database Initialization
-- This script runs once when the PostgreSQL container is first created.

-- Create extensions on the default database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create test database
CREATE DATABASE erp_test;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE erp_test TO CURRENT_USER;

-- Connect to test DB and create extensions there too
\c erp_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
