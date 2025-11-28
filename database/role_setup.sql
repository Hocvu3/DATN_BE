-- ===== APPLICATION ROLE CREATION =====
-- Create dedicated role for application queries (respects RLS, not superuser)

DO $$
BEGIN
    -- Create app_role if it doesn't exist
    -- Note: Password is set via ALTER ROLE below using environment variable
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_role') THEN
      -- Create role first without password (will be set below)
      EXECUTE 'CREATE ROLE app_role WITH LOGIN PASSWORD ' || quote_literal(current_setting('app.role_password', true));
      RAISE NOTICE '✅ Created app_role user';
    ELSE
        -- Update password if role already exists
        EXECUTE 'ALTER ROLE app_role WITH PASSWORD ' || quote_literal(current_setting('app.role_password', true));
        RAISE NOTICE '⚠️  app_role already exists, password updated';
    END IF;
    
    -- Grant database connection
    GRANT CONNECT ON DATABASE secure_document_management TO app_role;
    
    -- Grant schema usage
    GRANT USAGE ON SCHEMA public TO app_role;
    
    -- Grant table permissions (CRUD operations)
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
    
    -- Grant sequence usage (for auto-increment IDs)
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;
    
    -- Set default privileges for future tables/sequences
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_role;
    
    RAISE NOTICE '✅ Granted permissions to app_role';
END $$;

SELECT '✅ App role setup completed' as status;