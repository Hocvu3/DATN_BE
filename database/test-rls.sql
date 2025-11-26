-- ===== TEST RLS POLICIES WITH DEPARTMENT =====
-- Run this script to verify RLS is working correctly

\c secure_document_management;

-- Test 1: Set context as EMPLOYEE user in HR department
SET app.current_user_id = 'user-hr-emp1';
SET app.current_user_role = 'EMPLOYEE';
SET app.current_user_department_id = 'dept-hr';

-- Should only see PUBLIC and INTERNAL documents in HR department
SELECT 
  id, 
  title, 
  security_level, 
  creator_id,
  department_id,
  CASE 
    WHEN creator_id = 'user-hr-emp1' THEN 'Own document'
    WHEN department_id = 'dept-hr' AND security_level IN ('PUBLIC', 'INTERNAL') THEN 'Same department'
    ELSE 'Should not see this!'
  END as access_reason
FROM documents;

-- Test 2: Set context as MANAGER user in HR department
SET app.current_user_id = 'user-hr-manager';
SET app.current_user_role = 'MANAGER';
SET app.current_user_department_id = 'dept-hr';

-- Should see PUBLIC, INTERNAL, and CONFIDENTIAL documents in HR department only
SELECT 
  id, 
  title, 
  security_level,
  department_id,
  CASE 
    WHEN department_id = 'dept-hr' AND security_level IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL') THEN 'Manager access in HR'
    ELSE 'Should not see this!'
  END as access_reason
FROM documents;

-- Test 3: Set context as ADMIN user
SET app.current_user_id = 'user-admin';
SET app.current_user_role = 'ADMIN';
SET app.current_user_department_id = '';

-- Should see ALL documents regardless of department
SELECT 
  id, 
  title, 
  security_level,
  department_id,
  'Admin sees all' as access_reason
FROM documents;

-- Test 4: EMPLOYEE can only see users in same department
SET app.current_user_id = 'user-hr-emp1';
SET app.current_user_role = 'EMPLOYEE';
SET app.current_user_department_id = 'dept-hr';

SELECT 
  id, 
  email, 
  first_name,
  last_name,
  department_id,
  CASE 
    WHEN id = 'user-hr-emp1' THEN 'Own profile'
    WHEN department_id = 'dept-hr' THEN 'Should not see (not MANAGER)'
    ELSE 'Should not see'
  END as access_reason
FROM users;

-- Test 5: MANAGER can see users in same department
SET app.current_user_id = 'user-hr-manager';
SET app.current_user_role = 'MANAGER';
SET app.current_user_department_id = 'dept-hr';

SELECT 
  id, 
  email,
  first_name,
  last_name,
  department_id,
  CASE 
    WHEN department_id = 'dept-hr' THEN 'Manager sees team'
    ELSE 'Should not see (different department)'
  END as access_reason
FROM users;

-- Test 6: Admin can see all users
SET app.current_user_id = 'user-admin';
SET app.current_user_role = 'ADMIN';
SET app.current_user_department_id = '';

SELECT 
  id, 
  email,
  first_name,
  last_name,
  department_id,
  'Admin sees all users' as access_reason
FROM users
LIMIT 5;

-- Reset context
RESET app.current_user_id;
RESET app.current_user_role;
RESET app.current_user_department_id;

SELECT '✅ RLS tests with department completed' as status;
