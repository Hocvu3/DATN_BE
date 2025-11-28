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

-- Enable RLS only on users and documents tables
DO $$
BEGIN
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE '✅ RLS enabled on users and documents tables';
EXCEPTION
    WHEN undefined_table THEN
        RAISE EXCEPTION 'Tables do not exist! Run Prisma migrate/push first.';
END $$;

-- Users table policies
CREATE POLICY "users_select_policy" ON users
  FOR SELECT USING (
    id = get_current_user_id() OR 
    get_current_user_role() = 'ADMIN' OR
    (get_current_user_role() = 'MANAGER' AND department_id = get_current_user_department_id())
  );

CREATE POLICY "users_update_policy" ON users
  FOR UPDATE USING (
    id = get_current_user_id() OR 
    get_current_user_role() = 'ADMIN' OR
    (get_current_user_role() = 'MANAGER' AND department_id = get_current_user_department_id())
  );

CREATE POLICY "users_delete_policy" ON users
  FOR DELETE USING (
    id = get_current_user_id() OR 
    get_current_user_role() = 'ADMIN' OR
    (get_current_user_role() = 'MANAGER' AND department_id = get_current_user_department_id())
  );

-- Documents table policies
CREATE POLICY "documents_select_policy" ON documents
  FOR SELECT USING (
    get_current_user_role() = 'ADMIN' OR
    creator_id = get_current_user_id() OR
    (
      get_current_user_role() = 'MANAGER' AND 
      department_id = get_current_user_department_id() AND
      security_level IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL')
    ) OR
    (
      get_current_user_role() = 'EMPLOYEE' AND 
      department_id = get_current_user_department_id() AND
      security_level IN ('PUBLIC', 'INTERNAL')
    )
  );

CREATE POLICY "documents_insert_policy" ON documents
  FOR INSERT WITH CHECK (
    creator_id = get_current_user_id()
  );

CREATE POLICY "documents_update_policy" ON documents
  FOR UPDATE USING (
    creator_id = get_current_user_id() OR 
    get_current_user_role() = 'ADMIN'
  );

CREATE POLICY "documents_delete_policy" ON documents
  FOR DELETE USING (
    creator_id = get_current_user_id() OR 
    get_current_user_role() = 'ADMIN'
  );

SELECT '✅ RLS policies setup completed' as status;