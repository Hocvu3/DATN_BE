-- ===== SECURE DOCUMENT MANAGEMENT SYSTEM - MODULAR SETUP =====
-- This script applies RLS policies and audit triggers in modular way
-- Tables are created by Prisma migrations

-- ===== APPLICATION ROLE SETUP =====
\i role_setup.sql

-- ===== RLS POLICIES AND SECURITY FUNCTIONS =====
\i rls_policies.sql

-- ===== AUDIT TRIGGERS =====
\i audit_triggers.sql

-- ===== COMPLETION =====
DO $$
BEGIN
  RAISE NOTICE '✅ Database security setup completed successfully!';
  RAISE NOTICE '   - Application role configured';
  RAISE NOTICE '   - RLS policies applied';  
  RAISE NOTICE '   - Audit triggers enabled';
END $$;

SELECT 'Database Security Setup Complete' as final_status;

