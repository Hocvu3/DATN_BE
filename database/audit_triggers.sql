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
    old_data JSON;
    new_data JSON;
    changed_fields JSON;
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
    table_name TEXT;
BEGIN
    -- Create triggers for each specified table
    FOREACH table_name IN ARRAY tables_to_audit
    LOOP
        -- Check if table exists before creating triggers
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = table_name AND table_schema = 'public') THEN
            PERFORM create_audit_triggers_for_table(table_name);
        ELSE
            RAISE NOTICE 'Table % does not exist, skipping trigger creation', table_name;
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

SELECT '✅ Audit triggers created successfully for all tables' as status;