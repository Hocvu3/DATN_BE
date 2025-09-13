-- ===== SECURE DOCUMENT MANAGEMENT SYSTEM - POSTGRESQL INITIALIZATION =====

-- Create database
CREATE DATABASE secure_document_management;

-- Connect to the database
\c secure_document_management;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Create custom types for enums
CREATE TYPE document_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ARCHIVED');
CREATE TYPE security_level AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET');
CREATE TYPE notification_type AS ENUM ('DOCUMENT_CREATED', 'DOCUMENT_UPDATED', 'APPROVAL_REQUESTED', 'APPROVAL_GRANTED', 'APPROVAL_REJECTED', 'SIGNATURE_REQUESTED', 'SIGNATURE_COMPLETED', 'SYSTEM_ALERT');
CREATE TYPE signature_status AS ENUM ('PENDING', 'SIGNED', 'EXPIRED', 'CANCELLED');
CREATE TYPE signature_type AS ENUM ('ELECTRONIC', 'DIGITAL', 'ADVANCED_DIGITAL', 'QUALIFIED_DIGITAL');

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

-- Function to get current user department
CREATE OR REPLACE FUNCTION get_current_user_department()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_user_department', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION has_permission(required_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_permissions JSONB;
BEGIN
  SELECT permissions INTO user_permissions
  FROM roles r
  JOIN users u ON u.role_id = r.id
  WHERE u.id = get_current_user_id();
  
  RETURN user_permissions ? required_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== RLS POLICIES =====

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (id = get_current_user_id());

CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (has_permission('user:read:all'));

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (id = get_current_user_id());

CREATE POLICY "Admins can manage all users" ON users
  FOR ALL USING (has_permission('user:manage:all'));

-- Roles table policies
CREATE POLICY "Users can view roles" ON roles
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage roles" ON roles
  FOR ALL USING (has_permission('role:manage:all'));

-- Departments table policies
CREATE POLICY "Users can view departments" ON departments
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage departments" ON departments
  FOR ALL USING (has_permission('department:manage:all'));

-- Documents table policies
CREATE POLICY "Users can view documents based on security level" ON documents
  FOR SELECT USING (
    CASE 
      WHEN get_current_user_role() = 'ADMIN' THEN true
      WHEN get_current_user_role() = 'MANAGER' THEN 
        security_level IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL')
      WHEN get_current_user_role() = 'EMPLOYEE' THEN 
        (security_level IN ('PUBLIC', 'INTERNAL') AND 
        (creator_id = get_current_user_id() OR department_id = get_current_user_department()))
      ELSE false
    END
  );

CREATE POLICY "Users can create documents" ON documents
  FOR INSERT WITH CHECK (
    has_permission('document:create') AND
    creator_id = get_current_user_id()
  );

CREATE POLICY "Users can update their own documents" ON documents
  FOR UPDATE USING (
    creator_id = get_current_user_id() AND
    status = 'DRAFT'
  );

CREATE POLICY "Approvers can update documents for approval" ON documents
  FOR UPDATE USING (
    has_permission('document:approve') AND
    status = 'PENDING_APPROVAL'
  );

CREATE POLICY "Admins can manage all documents" ON documents
  FOR ALL USING (has_permission('document:manage:all'));

-- Document versions table policies
CREATE POLICY "Users can view document versions based on document access" ON document_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_versions.document_id
      AND (
        CASE 
          WHEN get_current_user_role() = 'ADMIN' THEN true
          WHEN get_current_user_role() = 'MANAGER' THEN 
            d.security_level IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL')
          WHEN get_current_user_role() = 'EMPLOYEE' THEN 
            (d.security_level IN ('PUBLIC', 'INTERNAL') AND 
            (d.creator_id = get_current_user_id() OR d.department_id = get_current_user_department()))
          ELSE false
        END
      )
    )
  );

CREATE POLICY "Users can create versions for their documents" ON document_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_versions.document_id
      AND d.creator_id = get_current_user_id()
    )
  );

-- Attachments table policies
CREATE POLICY "Users can view attachments based on document access" ON attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = attachments.document_id
      AND (
        CASE 
          WHEN get_current_user_role() = 'ADMIN' THEN true
          WHEN get_current_user_role() = 'MANAGER' THEN 
            d.security_level IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL')
          WHEN get_current_user_role() = 'EMPLOYEE' THEN 
            (d.security_level IN ('PUBLIC', 'INTERNAL') AND 
            (d.creator_id = get_current_user_id() OR d.department_id = get_current_user_department()))
          ELSE false
        END
      )
    )
  );

CREATE POLICY "Users can upload attachments to their documents" ON attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = attachments.document_id
      AND d.creator_id = get_current_user_id()
    )
  );

-- Comments table policies
CREATE POLICY "Users can view comments based on document access" ON comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = comments.document_id
      AND (
        CASE 
          WHEN get_current_user_role() = 'ADMIN' THEN true
          WHEN get_current_user_role() = 'MANAGER' THEN 
            d.security_level IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL')
          WHEN get_current_user_role() = 'EMPLOYEE' THEN 
            (d.security_level IN ('PUBLIC', 'INTERNAL') AND 
            (d.creator_id = get_current_user_id() OR d.department_id = get_current_user_department()))
          ELSE false
        END
      )
    )
  );

CREATE POLICY "Users can create comments" ON comments
  FOR INSERT WITH CHECK (
    author_id = get_current_user_id() AND
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = comments.document_id
      AND (
        CASE 
          WHEN get_current_user_role() = 'ADMIN' THEN true
          WHEN get_current_user_role() = 'MANAGER' THEN 
            d.security_level IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL')
          WHEN get_current_user_role() = 'EMPLOYEE' THEN 
            (d.security_level IN ('PUBLIC', 'INTERNAL') AND 
            (d.creator_id = get_current_user_id() OR d.department_id = get_current_user_department()))
          ELSE false
        END
      )
    )
  );

-- Notifications table policies
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT USING (recipient_id = get_current_user_id());

CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE USING (recipient_id = get_current_user_id());

-- Audit logs table policies
CREATE POLICY "Admins can view all audit logs" ON audit_logs
  FOR SELECT USING (has_permission('audit:read:all'));

CREATE POLICY "Users can view their own audit logs" ON audit_logs
  FOR SELECT USING (user_id = get_current_user_id());

-- ===== FULL-TEXT SEARCH INDEXES =====

-- Create full-text search indexes for documents
CREATE INDEX idx_documents_fts ON documents USING gin(
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(document_number, ''))
);

-- Create trigram indexes for fuzzy search
CREATE INDEX idx_documents_title_trgm ON documents USING gin(title gin_trgm_ops);
CREATE INDEX idx_documents_description_trgm ON documents USING gin(description gin_trgm_ops);
CREATE INDEX idx_documents_number_trgm ON documents USING gin(document_number gin_trgm_ops);

-- ===== ENCRYPTION FUNCTIONS =====

-- Function to encrypt sensitive data
CREATE OR REPLACE FUNCTION encrypt_sensitive_data(data TEXT, key_id TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_encrypt(data, key_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt sensitive data
CREATE OR REPLACE FUNCTION decrypt_sensitive_data(encrypted_data TEXT, key_id TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(encrypted_data, key_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== AUDIT TRIGGERS =====

-- Function to create audit log entry
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    action,
    resource,
    resource_id,
    user_id,
    details,
    timestamp
  ) VALUES (
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    get_current_user_id(),
    jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    ),
    NOW()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers for sensitive tables
CREATE TRIGGER audit_documents_trigger
  AFTER INSERT OR UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER audit_users_trigger
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER audit_roles_trigger
  AFTER INSERT OR UPDATE OR DELETE ON roles
  FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- ===== SECURITY VIEWS =====

-- View for document access control
CREATE VIEW document_access_control AS
SELECT 
  d.id,
  d.title,
  d.document_number,
  d.security_level,
  d.status,
  d.creator_id,
  d.department_id,
  u.username as creator_username,
  dept.name as department_name,
  CASE 
    WHEN get_current_user_role() = 'ADMIN' THEN true
    WHEN get_current_user_role() = 'MANAGER' THEN 
      d.security_level IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL')
    WHEN get_current_user_role() = 'EMPLOYEE' THEN 
      (d.security_level IN ('PUBLIC', 'INTERNAL') AND 
      (d.creator_id = get_current_user_id() OR d.department_id = get_current_user_department()))
    ELSE false
  END as can_access
FROM documents d
JOIN users u ON d.creator_id = u.id
LEFT JOIN departments dept ON d.department_id = dept.id;

-- View for user permissions
CREATE VIEW user_permissions AS
SELECT 
  u.id,
  u.username,
  u.email,
  r.name as role_name,
  r.permissions,
  d.name as department_name
FROM users u
JOIN roles r ON u.role_id = r.id
LEFT JOIN departments d ON u.department_id = d.id
WHERE u.is_active = true;

-- ===== INITIAL DATA =====

-- -- We do not need to insert data into the database as we are using Prisma for seeding

-- -- Insert default roles
-- INSERT INTO roles (id, name, description, permissions, is_active) VALUES
-- ('role-admin', 'ADMIN', 'System Administrator', '["*"]', true),
-- ('role-manager', 'MANAGER', 'Department Manager', '["document:read:all", "document:approve", "user:read:dept", "audit:read:dept"]', true),
-- ('role-employee', 'EMPLOYEE', 'Regular Employee', '["document:create", "document:read:own", "document:update:own"]', true);

-- -- Insert default departments
-- INSERT INTO departments (id, name, description, is_active) VALUES
-- ('dept-it', 'IT Department', 'Information Technology Department', true),
-- ('dept-hr', 'HR Department', 'Human Resources Department', true),
-- ('dept-finance', 'Finance Department', 'Finance and Accounting Department', true),
-- ('dept-sales', 'Sales Department', 'Sales and Marketing Department', true);

-- -- Insert default admin user (password: admin123)
-- INSERT INTO users (id, email, username, password_hash, first_name, last_name, role_id, department_id, is_active) VALUES
-- ('user-admin', 'admin@company.com', 'admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5u.Ge', 'System', 'Administrator', 'role-admin', 'dept-it', true);

-- -- Insert almighty user (password: almighty123)
-- INSERT INTO users (id, email, username, password_hash, first_name, last_name, role_id, department_id, is_active) VALUES
-- ('user-almighty', 'almighty@company.com', 'almighty', '$2b$12$9K8mN7vX2qR5tY1wE3sD6fG8hJ2kL4mN7pQ9rS2tU3vW4xY5zA6bC7dE8fG', 'Almighty', 'Master', 'role-admin', 'dept-it', true);

-- -- Insert manager users (password: manager123)
-- INSERT INTO users (id, email, username, password_hash, first_name, last_name, role_id, department_id, is_active) VALUES
-- ('user-hr-manager', 'hr.manager@company.com', 'hr_manager', '$2b$12$A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C', 'Sarah', 'Johnson', 'role-manager', 'dept-hr', true),
-- ('user-finance-manager', 'finance.manager@company.com', 'finance_manager', '$2b$12$B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6a7B8c9D', 'Michael', 'Chen', 'role-manager', 'dept-finance', true),
-- ('user-sales-manager', 'sales.manager@company.com', 'sales_manager', '$2b$12$C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E', 'Emily', 'Rodriguez', 'role-manager', 'dept-sales', true),
-- ('user-it-manager', 'it.manager@company.com', 'it_manager', '$2b$12$D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6a7B8c9D0e1F', 'David', 'Thompson', 'role-manager', 'dept-it', true);

-- -- Insert employee users (password: employee123)
-- INSERT INTO users (id, email, username, password_hash, first_name, last_name, role_id, department_id, is_active) VALUES
-- ('user-hr-emp1', 'hr.emp1@company.com', 'hr_emp1', '$2b$12$E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E1f2G', 'Lisa', 'Wang', 'role-employee', 'dept-hr', true),
-- ('user-hr-emp2', 'hr.emp2@company.com', 'hr_emp2', '$2b$12$F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6a7B8c9D0e1F2g3H', 'James', 'Brown', 'role-employee', 'dept-hr', true),
-- ('user-finance-emp1', 'finance.emp1@company.com', 'finance_emp1', '$2b$12$G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E1f2G3h4I', 'Maria', 'Garcia', 'role-employee', 'dept-finance', true),
-- ('user-finance-emp2', 'finance.emp2@company.com', 'finance_emp2', '$2b$12$H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6a7B8c9D0e1F2g3H4i5J', 'Robert', 'Wilson', 'role-employee', 'dept-finance', true),
-- ('user-sales-emp1', 'sales.emp1@company.com', 'sales_emp1', '$2b$12$I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E1f2G3h4I5j6K', 'Jennifer', 'Davis', 'role-employee', 'dept-sales', true),
-- ('user-sales-emp2', 'sales.emp2@company.com', 'sales_emp2', '$2b$12$J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6a7B8c9D0e1F2g3H4i5J6k7L', 'Christopher', 'Miller', 'role-employee', 'dept-sales', true),
-- ('user-it-emp1', 'it.emp1@company.com', 'it_emp1', '$2b$12$K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E1f2G3h4I5j6K7l8M', 'Amanda', 'Taylor', 'role-employee', 'dept-it', true),
-- ('user-it-emp2', 'it.emp2@company.com', 'it_emp2', '$2b$12$L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6a7B8c9D0e1F2g3H4i5J6k7L8m9N', 'Kevin', 'Anderson', 'role-employee', 'dept-it', true);

-- ===== SECURITY CONFIGURATION =====

-- Set default security settings
ALTER DATABASE secure_document_management SET log_statement = 'all';
ALTER DATABASE secure_document_management SET log_connections = on;
ALTER DATABASE secure_document_management SET log_disconnections = on;

-- Create security roles
CREATE ROLE app_user WITH LOGIN PASSWORD 'secure_password';
CREATE ROLE app_admin WITH LOGIN PASSWORD 'admin_secure_password';

-- Grant permissions
GRANT CONNECT ON DATABASE secure_document_management TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

GRANT ALL PRIVILEGES ON DATABASE secure_document_management TO app_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_admin;

-- ===== COMPLETION MESSAGE =====
SELECT 'PostgreSQL database initialized successfully with security features!' as status;
