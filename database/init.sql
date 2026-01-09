-- ===== SECURE DOCUMENT MANAGEMENT SYSTEM - INTEGRATED SETUP =====
-- This script applies RLS policies and audit triggers
-- Tables are created by Prisma migrations
-- Auto-generated from modular components

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


-- ===== SECURITY FUNCTIONS =====

-- Function to get current user ID from JWT
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_user_id', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current user role
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_user_role', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current user department ID
CREATE OR REPLACE FUNCTION get_current_user_department_id()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_user_department_id', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== RLS POLICIES =====
-- Tables must exist before running this script (created by Prisma)

-- Drop existing policies if they exist
DO $$ 
BEGIN
    DROP POLICY IF EXISTS users_select_policy ON users;
    DROP POLICY IF EXISTS users_update_policy ON users;
    DROP POLICY IF EXISTS users_delete_policy ON users;
    DROP POLICY IF EXISTS documents_select_policy ON documents;
    DROP POLICY IF EXISTS documents_insert_policy ON documents;
    DROP POLICY IF EXISTS documents_update_policy ON documents;
    DROP POLICY IF EXISTS documents_delete_policy ON documents;
EXCEPTION
    WHEN undefined_table THEN 
        RAISE NOTICE 'Tables do not exist yet, skipping policy drops';
    WHEN undefined_object THEN 
        RAISE NOTICE 'Policies do not exist, skipping drops';
END $$;

-- Enable RLS only on documents table (NOT on users to allow login)
DO $$
BEGIN
    -- Disable RLS on users table to allow login/authentication
    ALTER TABLE users DISABLE ROW LEVEL SECURITY;
    RAISE NOTICE '✅ RLS disabled on users table (allows login)';
    
    -- Enable RLS on documents table for security
    ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE '✅ RLS enabled on documents table';
EXCEPTION
    WHEN undefined_table THEN
        RAISE EXCEPTION 'Tables do not exist! Run Prisma migrate/push first.';
END $$;

-- Documents table policies with PUBLIC access support
-- Allow viewing PUBLIC documents even when not logged in
CREATE POLICY "documents_select_policy" ON documents
  FOR SELECT USING (
    -- PUBLIC documents are accessible to everyone (even without login)
    security_level = 'PUBLIC' OR
    -- Admin can see everything
    get_current_user_role() = 'ADMIN' OR
    -- Creator can always see their own documents
    creator_id = get_current_user_id() OR
    -- Manager can see all documents in their department (any security level)
    (
      get_current_user_role() = 'MANAGER' AND 
      department_id = get_current_user_department_id()
    )
  );

CREATE POLICY "documents_insert_policy" ON documents
  FOR INSERT WITH CHECK (
    creator_id = get_current_user_id()
  );

CREATE POLICY "documents_update_policy" ON documents
  FOR UPDATE USING (
    creator_id = get_current_user_id() OR 
    get_current_user_role() = 'ADMIN' OR
    (
      get_current_user_role() = 'MANAGER' AND 
      department_id = get_current_user_department_id()
    )
  );

CREATE POLICY "documents_delete_policy" ON documents
  FOR DELETE USING (
    creator_id = get_current_user_id() OR 
    get_current_user_role() = 'ADMIN' OR
    (
      get_current_user_role() = 'MANAGER' AND 
      department_id = get_current_user_department_id()
    )
  );


-- ===== AUDIT TRIGGERS FOR AUTOMATIC LOGGING =====
-- This script creates triggers for automatic audit logging on all tables

-- ===== AUDIT TRIGGER FUNCTION =====
-- Generic function to log audit events
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    user_id_value TEXT;
    ip_address_value TEXT;
    user_agent_value TEXT;
    old_data JSONB;
    new_data JSONB;
    changed_fields JSONB;
BEGIN
    -- Get current user context
    user_id_value := NULLIF(current_setting('app.current_user_id', true), '');
    ip_address_value := NULLIF(current_setting('app.current_ip_address', true), '');
    user_agent_value := NULLIF(current_setting('app.current_user_agent', true), '');
    
    -- Handle different trigger operations
    CASE TG_OP
        WHEN 'INSERT' THEN
            new_data := to_jsonb(NEW);
            INSERT INTO audit_logs (
                action,
                resource,
                resource_id,
                user_id,
                details,
                ip_address,
                user_agent,
                timestamp
            ) VALUES (
                'CREATE',
                TG_TABLE_NAME,
                NEW.id::TEXT,
                user_id_value,
                jsonb_build_object(
                    'operation', 'INSERT',
                    'new_data', new_data
                ),
                ip_address_value,
                user_agent_value,
                NOW()
            );
            RETURN NEW;
            
        WHEN 'UPDATE' THEN
            old_data := to_jsonb(OLD);
            new_data := to_jsonb(NEW);
            
            -- Calculate changed fields
            changed_fields := (
                SELECT jsonb_object_agg(key, jsonb_build_object('old', old_data->key, 'new', new_data->key))
                FROM jsonb_each(old_data)
                WHERE old_data->key IS DISTINCT FROM new_data->key
            );
            
            -- Only log if there are actual changes
            IF changed_fields IS NOT NULL AND jsonb_typeof(changed_fields) = 'object' AND changed_fields != '{}'::jsonb THEN
                INSERT INTO audit_logs (
                    action,
                    resource,
                    resource_id,
                    user_id,
                    details,
                    ip_address,
                    user_agent,
                    timestamp
                ) VALUES (
                    'UPDATE',
                    TG_TABLE_NAME,
                    NEW.id::TEXT,
                    user_id_value,
                    jsonb_build_object(
                        'operation', 'UPDATE',
                        'changed_fields', changed_fields
                    ),
                    ip_address_value,
                    user_agent_value,
                    NOW()
                );
            END IF;
            RETURN NEW;
            
        WHEN 'DELETE' THEN
            old_data := to_jsonb(OLD);
            INSERT INTO audit_logs (
                action,
                resource,
                resource_id,
                user_id,
                details,
                ip_address,
                user_agent,
                timestamp
            ) VALUES (
                'DELETE',
                TG_TABLE_NAME,
                OLD.id::TEXT,
                user_id_value,
                jsonb_build_object(
                    'operation', 'DELETE',
                    'deleted_data', old_data
                ),
                ip_address_value,
                user_agent_value,
                NOW()
            );
            RETURN OLD;
    END CASE;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== CREATE TRIGGERS FOR ALL TABLES =====

-- Function to create audit triggers for a table
CREATE OR REPLACE FUNCTION create_audit_triggers_for_table(table_name TEXT)
RETURNS VOID AS $$
BEGIN
    -- Drop existing triggers if they exist
    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit_insert ON %I', table_name, table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit_update ON %I', table_name, table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit_delete ON %I', table_name, table_name);
    
    -- Create INSERT trigger
    EXECUTE format('
        CREATE TRIGGER %I_audit_insert
        AFTER INSERT ON %I
        FOR EACH ROW
        EXECUTE FUNCTION audit_trigger_function()
    ', table_name, table_name);
    
    -- Create UPDATE trigger
    EXECUTE format('
        CREATE TRIGGER %I_audit_update
        AFTER UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION audit_trigger_function()
    ', table_name, table_name);
    
    -- Create DELETE trigger
    EXECUTE format('
        CREATE TRIGGER %I_audit_delete
        AFTER DELETE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION audit_trigger_function()
    ', table_name, table_name);
    
    RAISE NOTICE 'Created audit triggers for table: %', table_name;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all relevant tables (excluding audit_logs to avoid infinite loops)
DO $$
DECLARE
    table_record RECORD;
    tables_to_audit TEXT[] := ARRAY[
        'users',
        'roles', 
        'departments',
        'documents',
        'document_versions',
        'tags',
        'document_tags',
        'notifications',
        'comments',
        'signature_requests',
        'digital_signatures',
        'assets'
    ];
    tbl_name TEXT;
BEGIN
    -- Create triggers for each specified table
    FOREACH tbl_name IN ARRAY tables_to_audit
    LOOP
        -- Check if table exists before creating triggers
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl_name AND table_schema = 'public') THEN
            PERFORM create_audit_triggers_for_table(tbl_name);
        ELSE
            RAISE NOTICE 'Table % does not exist, skipping trigger creation', tbl_name;
        END IF;
    END LOOP;
    
    RAISE NOTICE '✅ All audit triggers created successfully!';
END $$;

-- ===== HELPER FUNCTIONS FOR SETTING CONTEXT =====

-- Function to set current user context (to be called from application)
CREATE OR REPLACE FUNCTION set_audit_context(
    user_id TEXT DEFAULT NULL,
    ip_address TEXT DEFAULT NULL,
    user_agent TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    IF user_id IS NOT NULL THEN
        PERFORM set_config('app.current_user_id', user_id, true);
    END IF;
    
    IF ip_address IS NOT NULL THEN
        PERFORM set_config('app.current_ip_address', ip_address, true);
    END IF;
    
    IF user_agent IS NOT NULL THEN
        PERFORM set_config('app.current_user_agent', user_agent, true);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clear audit context
CREATE OR REPLACE FUNCTION clear_audit_context()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.current_ip_address', '', true);
    PERFORM set_config('app.current_user_agent', '', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== READ OPERATION LOGGING (OPTIONAL) =====
-- Note: For performance reasons, we typically don't log READ operations via triggers
-- Instead, log them in application code when needed

-- Function to log read operations (call from application)
CREATE OR REPLACE FUNCTION log_read_operation(
    resource_name TEXT,
    resource_id TEXT,
    user_id TEXT DEFAULT NULL,
    ip_address TEXT DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    additional_details JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO audit_logs (
        action,
        resource,
        resource_id,
        user_id,
        details,
        ip_address,
        user_agent,
        timestamp
    ) VALUES (
        'READ',
        resource_name,
        resource_id,
        COALESCE(user_id, current_setting('app.current_user_id', true)),
        COALESCE(
            additional_details, 
            jsonb_build_object('operation', 'READ')
        ),
        COALESCE(ip_address, current_setting('app.current_ip_address', true)),
        COALESCE(user_agent, current_setting('app.current_user_agent', true)),
        NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ===== COMPLETION =====
DO $$
BEGIN
  RAISE NOTICE '✅ Database security setup completed successfully!';
  RAISE NOTICE '   - Application role configured';
  RAISE NOTICE '   - RLS disabled on users (allows login/auth)';
  RAISE NOTICE '   - RLS enabled on documents (with PUBLIC access support)';  
  RAISE NOTICE '   - Audit triggers enabled';
END $$;

SELECT 'Database Security Setup Complete' as final_status;
