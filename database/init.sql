-- ===== SECURE DOCUMENT MANAGEMENT SYSTEM - SIMPLIFIED RLS SETUP =====

-- Connect to the database
\c secure_document_management;

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

-- Enable RLS only on users and documents tables only
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

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

  -- ===== LOGGING MESSAGE FOR DOCKER CONTAINER =====
  DO $$
  BEGIN
    RAISE NOTICE '✅ RLS enabled for users and documents tables';
  END;
  $$;

  -- ===== COMPLETION MESSAGE =====
  SELECT '✅ RLS enabled for users and documents tables' as status;

