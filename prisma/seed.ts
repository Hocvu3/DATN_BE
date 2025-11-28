import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// Use admin connection for seeding (DATABASE_ADMIN_URL if available, otherwise DATABASE_URL)
const databaseUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

async function main(): Promise<void> {
  console.log('🌱 Starting database seeding...');
  console.log(`📊 Using connection: ${databaseUrl?.split('@')[1] || 'default'}`);  // Log host without password

  // Create roles (matching init.sql)
  console.log('📝 Creating roles...');
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      id: 'role-admin',
      name: 'ADMIN',
      description: 'System Administrator',
      permissions: ['*'],
      isActive: true,
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: 'MANAGER' },
    update: {},
    create: {
      id: 'role-manager',
      name: 'MANAGER',
      description: 'Department Manager',
      permissions: [
        'document:read:all',
        'document:approve',
        'user:read:dept',
        'audit:read:dept',
        'document:create',
        'document:update:own',
        'notification:read',
        'comment:create',
        'comment:read',
      ],
      isActive: true,
    },
  });

  const employeeRole = await prisma.role.upsert({
    where: { name: 'EMPLOYEE' },
    update: {},
    create: {
      id: 'role-employee',
      name: 'EMPLOYEE',
      description: 'Regular Employee',
      permissions: [
        'document:create',
        'document:read:own',
        'document:update:own',
        'notification:read',
        'comment:create',
        'comment:read',
      ],
      isActive: true,
    },
  });

  // Create departments (matching init.sql)
  console.log('🏢 Creating departments...');
  const itDept = await prisma.department.upsert({
    where: { name: 'IT Department' },
    update: {},
    create: {
      id: 'dept-it',
      name: 'IT Department',
      description: 'Information Technology Department',
      isActive: true,
    },
  });

  const hrDept = await prisma.department.upsert({
    where: { name: 'HR Department' },
    update: {},
    create: {
      id: 'dept-hr',
      name: 'HR Department',
      description: 'Human Resources Department',
      isActive: true,
    },
  });

  const financeDept = await prisma.department.upsert({
    where: { name: 'Finance Department' },
    update: {},
    create: {
      id: 'dept-finance',
      name: 'Finance Department',
      description: 'Finance and Accounting Department',
      isActive: true,
    },
  });

  const salesDept = await prisma.department.upsert({
    where: { name: 'Sales Department' },
    update: {},
    create: {
      id: 'dept-sales',
      name: 'Sales Department',
      description: 'Sales and Marketing Department',
      isActive: true,
    },
  });

  // Create users (matching init.sql)
  console.log('👥 Creating users...');
  const adminPassword = await bcrypt.hash('admin123', 12);
  const almightyPassword = await bcrypt.hash('admin123', 12);
  const managerPassword = await bcrypt.hash('manager123', 12);
  const employeePassword = await bcrypt.hash('employee123', 12);

  const adminUser = await prisma.user.upsert({
    where: { email: 'hocvu2003@gmail.com' },
    update: {},
    create: {
      id: 'user-admin',
      email: 'hocvu2003@gmail.com',
      username: 'admin',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      roleId: adminRole.id,
      departmentId: itDept.id,
      isActive: true,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const almightyUser = await prisma.user.upsert({
    where: { email: 'hocvt2@vmogroup.com' },
    update: {},
    create: {
      id: 'user-almighty',
      email: 'hocvt2@vmogroup.com',
      username: 'almighty',
      passwordHash: almightyPassword,
      firstName: 'Admin',
      lastName: 'Master',
      roleId: adminRole.id,
      departmentId: itDept.id,
      isActive: true,
    },
  });

  const hrManager = await prisma.user.upsert({
    where: { email: 'hr.manager@company.com' },
    update: {},
    create: {
      id: 'user-hr-manager',
      email: 'hr.manager@company.com',
      username: 'hr_manager',
      passwordHash: managerPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      roleId: managerRole.id,
      departmentId: hrDept.id,
      isActive: true,
    },
  });

  const financeManager = await prisma.user.upsert({
    where: { email: 'finance.manager@company.com' },
    update: {},
    create: {
      id: 'user-finance-manager',
      email: 'finance.manager@company.com',
      username: 'finance_manager',
      passwordHash: managerPassword,
      firstName: 'Michael',
      lastName: 'Chen',
      roleId: managerRole.id,
      departmentId: financeDept.id,
      isActive: true,
    },
  });

  const salesManager = await prisma.user.upsert({
    where: { email: 'sales.manager@company.com' },
    update: {},
    create: {
      id: 'user-sales-manager',
      email: 'sales.manager@company.com',
      username: 'sales_manager',
      passwordHash: managerPassword,
      firstName: 'Emily',
      lastName: 'Rodriguez',
      roleId: managerRole.id,
      departmentId: salesDept.id,
      isActive: true,
    },
  });

  const itManager = await prisma.user.upsert({
    where: { email: 'it.manager@company.com' },
    update: {},
    create: {
      id: 'user-it-manager',
      email: 'it.manager@company.com',
      username: 'it_manager',
      passwordHash: managerPassword,
      firstName: 'David',
      lastName: 'Thompson',
      roleId: managerRole.id,
      departmentId: itDept.id,
      isActive: true,
    },
  });

  // Create employee users
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hrEmp1 = await prisma.user.upsert({
    where: { email: 'hr.emp1@company.com' },
    update: {},
    create: {
      id: 'user-hr-emp1',
      email: 'hr.emp1@company.com',
      username: 'hr_emp1',
      passwordHash: employeePassword,
      firstName: 'Lisa',
      lastName: 'Wang',
      roleId: employeeRole.id,
      departmentId: hrDept.id,
      isActive: true,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hrEmp2 = await prisma.user.upsert({
    where: { email: 'hr.emp2@company.com' },
    update: {},
    create: {
      id: 'user-hr-emp2',
      email: 'hr.emp2@company.com',
      username: 'hr_emp2',
      passwordHash: employeePassword,
      firstName: 'James',
      lastName: 'Brown',
      roleId: employeeRole.id,
      departmentId: hrDept.id,
      isActive: true,
    },
  });

  const financeEmp1 = await prisma.user.upsert({
    where: { email: 'finance.emp1@company.com' },
    update: {},
    create: {
      id: 'user-finance-emp1',
      email: 'finance.emp1@company.com',
      username: 'finance_emp1',
      passwordHash: employeePassword,
      firstName: 'Maria',
      lastName: 'Garcia',
      roleId: employeeRole.id,
      departmentId: financeDept.id,
      isActive: true,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const financeEmp2 = await prisma.user.upsert({
    where: { email: 'finance.emp2@company.com' },
    update: {},
    create: {
      id: 'user-finance-emp2',
      email: 'finance.emp2@company.com',
      username: 'finance_emp2',
      passwordHash: employeePassword,
      firstName: 'Robert',
      lastName: 'Wilson',
      roleId: employeeRole.id,
      departmentId: financeDept.id,
      isActive: true,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const salesEmp1 = await prisma.user.upsert({
    where: { email: 'sales.emp1@company.com' },
    update: {},
    create: {
      id: 'user-sales-emp1',
      email: 'sales.emp1@company.com',
      username: 'sales_emp1',
      passwordHash: employeePassword,
      firstName: 'Jennifer',
      lastName: 'Davis',
      roleId: employeeRole.id,
      departmentId: salesDept.id,
      isActive: true,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const salesEmp2 = await prisma.user.upsert({
    where: { email: 'sales.emp2@company.com' },
    update: {},
    create: {
      id: 'user-sales-emp2',
      email: 'sales.emp2@company.com',
      username: 'sales_emp2',
      passwordHash: employeePassword,
      firstName: 'Christopher',
      lastName: 'Miller',
      roleId: employeeRole.id,
      departmentId: salesDept.id,
      isActive: true,
    },
  });

  const itEmp1 = await prisma.user.upsert({
    where: { email: 'it.emp1@company.com' },
    update: {},
    create: {
      id: 'user-it-emp1',
      email: 'it.emp1@company.com',
      username: 'it_emp1',
      passwordHash: employeePassword,
      firstName: 'Amanda',
      lastName: 'Taylor',
      roleId: employeeRole.id,
      departmentId: itDept.id,
      isActive: true,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const itEmp2 = await prisma.user.upsert({
    where: { email: 'it.emp2@company.com' },
    update: {},
    create: {
      id: 'user-it-emp2',
      email: 'it.emp2@company.com',
      username: 'it_emp2',
      passwordHash: employeePassword,
      firstName: 'Kevin',
      lastName: 'Anderson',
      roleId: employeeRole.id,
      departmentId: itDept.id,
      isActive: true,
    },
  });

  // Create tags
  console.log('🏷️ Creating tags...');
  // Bulk upsert tags to avoid duplicate issues and improve performance
  const tagData = [
    {
      name: 'Confidential',
      color: '#ff4444',
      description: 'Confidential documents',
      isActive: true,
    },
    {
      name: 'Internal',
      color: '#4444ff',
      description: 'Internal use only',
      isActive: true,
    },
    {
      name: 'Public',
      color: '#44ff44',
      description: 'Public documents',
      isActive: true,
    },
    {
      name: 'Draft',
      color: '#ffaa44',
      description: 'Draft documents',
      isActive: true,
    },
    {
      name: 'Approved',
      color: '#44ffaa',
      description: 'Approved documents',
      isActive: true,
    },
    {
      name: 'Financial',
      color: '#aa44ff',
      description: 'Financial documents',
      isActive: true,
    },
  ];

  // Prisma does not support true bulk upsert, so use Promise.all with upsert for each tag
  const tags = await Promise.all(
    tagData.map(tag =>
      prisma.tag.upsert({
        where: { name: tag.name },
        update: {},
        create: tag,
      }),
    ),
  );

  // Create sample documents
  console.log('📄 Creating sample documents...');
  const documents = await Promise.all([
    prisma.document.create({
      data: {
        title: 'Company Security Policy',
        description: 'Internal security guidelines for all employees',
        documentNumber: 'SEC-2024-001',
        status: 'APPROVED',
        securityLevel: 'CONFIDENTIAL',
        isConfidential: true,
        departmentId: itDept.id, // IT Department - 2 documents
        creatorId: adminUser.id,
        approverId: hrManager.id,
        tags: {
          create: [
            { tagId: tags[0].id }, // Confidential
            { tagId: tags[4].id }, // Approved
          ],
        },
      },
    }),
    prisma.document.create({
      data: {
        title: 'Employee Handbook',
        description: 'Company policies and procedures for employees',
        documentNumber: 'HR-2024-001',
        status: 'APPROVED',
        securityLevel: 'INTERNAL',
        isConfidential: false,
        departmentId: hrDept.id, // HR Department - 1 document
        creatorId: hrManager.id,
        approverId: adminUser.id,
        tags: {
          create: [
            { tagId: tags[1].id }, // Internal
            { tagId: tags[4].id }, // Approved
          ],
        },
      },
    }),
    prisma.document.create({
      data: {
        title: 'Financial Report Q1 2024',
        description: 'Quarterly financial performance report',
        documentNumber: 'FIN-2024-Q1',
        status: 'PENDING_APPROVAL',
        securityLevel: 'SECRET',
        isConfidential: true,
        departmentId: financeDept.id, // Finance Department - 1 document
        creatorId: financeEmp1.id,
        tags: {
          create: [
            { tagId: tags[0].id }, // Confidential
            { tagId: tags[5].id }, // Financial
          ],
        },
      },
    }),
    prisma.document.create({
      data: {
        title: 'IT Infrastructure Plan',
        description: 'Technology roadmap and infrastructure planning',
        documentNumber: 'IT-2024-001',
        status: 'DRAFT',
        securityLevel: 'INTERNAL',
        isConfidential: false,
        departmentId: itDept.id, // IT Department - 2 documents
        creatorId: itEmp1.id,
        tags: {
          create: [
            { tagId: tags[1].id }, // Internal
            { tagId: tags[3].id }, // Draft
          ],
        },
      },
    }),
    prisma.document.create({
      data: {
        title: 'Sales Strategy 2024',
        description: 'Annual sales strategy and targets',
        documentNumber: 'SALES-2024-001',
        status: 'APPROVED',
        securityLevel: 'CONFIDENTIAL',
        isConfidential: true,
        departmentId: financeDept.id, // Finance Department - 2 documents (split with Financial Report)
        creatorId: salesManager.id,
        approverId: adminUser.id,
        tags: {
          create: [
            { tagId: tags[0].id }, // Confidential
            { tagId: tags[4].id }, // Approved
          ],
        },
      },
    }),
  ]);

  // Create document versions
  console.log('📝 Creating document versions...');
  await Promise.all([
    prisma.documentVersion.create({
      data: {
        versionNumber: 1,
        filePath: '/uploads/documents/sec-2024-001-v1.pdf',
        fileSize: 2048576,
        checksum: 'abc123def456ghi789',
        mimeType: 'application/pdf',
        isEncrypted: true,
        encryptionKey: 'enc_key_001',
        documentId: documents[0].id,
        creatorId: adminUser.id,
      },
    }),
    prisma.documentVersion.create({
      data: {
        versionNumber: 2,
        filePath: '/uploads/documents/sec-2024-001-v2.pdf',
        fileSize: 2150400,
        checksum: 'def456ghi789jkl012',
        mimeType: 'application/pdf',
        isEncrypted: true,
        encryptionKey: 'enc_key_002',
        documentId: documents[0].id,
        creatorId: adminUser.id,
      },
    }),
    prisma.documentVersion.create({
      data: {
        versionNumber: 1,
        filePath: '/uploads/documents/hr-2024-001-v1.pdf',
        fileSize: 1536000,
        checksum: 'ghi789jkl012mno345',
        mimeType: 'application/pdf',
        isEncrypted: false,
        documentId: documents[1].id,
        creatorId: hrManager.id,
      },
    }),
    prisma.documentVersion.create({
      data: {
        versionNumber: 1,
        filePath: '/uploads/documents/fin-2024-q1-v1.xlsx',
        fileSize: 512000,
        checksum: 'jkl012mno345pqr678',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        isEncrypted: true,
        encryptionKey: 'enc_key_003',
        documentId: documents[2].id,
        creatorId: financeEmp1.id,
      },
    }),
  ]);

  // Create comments
  console.log('💬 Creating comments...');
  await Promise.all([
    prisma.comment.create({
      data: {
        content:
          'This policy looks comprehensive and well-structured. All security measures are properly addressed.',
        isInternal: false,
        documentId: documents[0].id,
        authorId: hrManager.id,
      },
    }),
    prisma.comment.create({
      data: {
        content:
          'Please review the financial projections section and ensure all numbers are accurate.',
        isInternal: true,
        documentId: documents[2].id,
        authorId: financeManager.id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'The IT infrastructure plan needs more details about cloud migration strategy.',
        isInternal: false,
        documentId: documents[3].id,
        authorId: itManager.id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Sales targets for Q2 seem ambitious but achievable with proper execution.',
        isInternal: true,
        documentId: documents[4].id,
        authorId: adminUser.id,
      },
    }),
  ]);

  // Create signature requests
  console.log('✍️ Creating signature requests...');
  const signatureRequests = await Promise.all([
    prisma.signatureRequest.create({
      data: {
        status: 'SIGNED',
        signedAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-02-15T10:30:00Z'),
        signatureType: 'DIGITAL',
        reason: 'Legal approval required for company policy',
        documentId: documents[0].id,
        requesterId: adminUser.id,
      },
    }),
    prisma.signatureRequest.create({
      data: {
        status: 'PENDING',
        expiresAt: new Date('2024-02-20T10:30:00Z'),
        signatureType: 'ELECTRONIC',
        reason: 'Financial report approval',
        documentId: documents[2].id,
        requesterId: financeEmp1.id,
      },
    }),
  ]);

  // Create digital signatures
  console.log('🔐 Creating digital signatures...');
  await Promise.all([
    prisma.digitalSignature.create({
      data: {
        signatureData: 'encrypted_signature_data_001',
        certificateInfo: {
          issuer: 'Company CA',
          validFrom: '2024-01-01',
          validTo: '2025-01-01',
          serialNumber: 'CA001',
        },
        signedAt: new Date('2024-01-15T10:30:00Z'),
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        requestId: signatureRequests[0].id,
        signerId: hrManager.id,
      },
    }),
  ]);

  // Create notifications
  console.log('🔔 Creating notifications...');
  await Promise.all([
    prisma.notification.create({
      data: {
        type: 'DOCUMENT_CREATED',
        title: 'New Document Created',
        message: 'Company Security Policy has been created and requires your approval.',
        recipientId: hrManager.id,
      },
    }),
    prisma.notification.create({
      data: {
        type: 'APPROVAL_REQUESTED',
        title: 'Approval Required',
        message: 'Financial Report Q1 2024 is pending your approval.',
        recipientId: financeManager.id,
      },
    }),
    prisma.notification.create({
      data: {
        type: 'SIGNATURE_REQUESTED',
        title: 'Digital Signature Required',
        message: 'Please sign the Financial Report Q1 2024 document.',
        recipientId: financeManager.id,
      },
    }),
    prisma.notification.create({
      data: {
        type: 'DOCUMENT_UPDATED',
        title: 'Document Updated',
        message: 'IT Infrastructure Plan has been updated with new version.',
        recipientId: itManager.id,
      },
    }),
    prisma.notification.create({
      data: {
        type: 'SYSTEM_ALERT',
        title: 'System Maintenance',
        message: 'Scheduled maintenance will occur on Sunday at 2 AM.',
        recipientId: adminUser.id,
      },
    }),
  ]);

  // Create audit logs
  console.log('📋 Creating audit logs...');
  await Promise.all([
    prisma.auditLog.create({
      data: {
        action: 'CREATE',
        resource: 'Document',
        resourceId: documents[0].id,
        userId: adminUser.id,
        details: {
          documentTitle: documents[0].title,
          securityLevel: documents[0].securityLevel,
          documentNumber: documents[0].documentNumber,
        },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'APPROVE',
        resource: 'Document',
        resourceId: documents[0].id,
        userId: hrManager.id,
        details: {
          documentTitle: documents[0].title,
          approvalReason: 'Policy meets security requirements',
        },
        ipAddress: '192.168.1.101',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'SIGN',
        resource: 'Document',
        resourceId: documents[0].id,
        userId: hrManager.id,
        details: {
          documentTitle: documents[0].title,
          signatureType: 'DIGITAL',
          certificateInfo: 'Company CA - CA001',
        },
        ipAddress: '192.168.1.101',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'CREATE',
        resource: 'Document',
        resourceId: documents[2].id,
        userId: financeEmp1.id,
        details: {
          documentTitle: documents[2].title,
          securityLevel: documents[2].securityLevel,
          documentNumber: documents[2].documentNumber,
        },
        ipAddress: '192.168.1.102',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'LOGIN',
        resource: 'User',
        resourceId: adminUser.id,
        userId: adminUser.id,
        details: {
          loginTime: new Date().toISOString(),
          sessionId: 'session_001',
        },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }),
  ]);

  console.log('✅ Database seeding completed successfully!');
  console.log('');
  console.log('📊 Seeded Data Summary:');
  console.log(`   - Roles: ${await prisma.role.count()}`);
  console.log(`   - Departments: ${await prisma.department.count()}`);
  console.log(`   - Users: ${await prisma.user.count()}`);
  console.log(`   - Tags: ${await prisma.tag.count()}`);
  console.log(`   - Documents: ${await prisma.document.count()}`);
  console.log(`   - Document Versions: ${await prisma.documentVersion.count()}`);
  console.log(`   - Comments: ${await prisma.comment.count()}`);
  console.log(`   - Signature Requests: ${await prisma.signatureRequest.count()}`);
  console.log(`   - Digital Signatures: ${await prisma.digitalSignature.count()}`);
  console.log(`   - Notifications: ${await prisma.notification.count()}`);
  console.log(`   - Audit Logs: ${await prisma.auditLog.count()}`);
  console.log('');
  console.log('🔐 Default Login Credentials:');
  console.log('   Admin: admin@company.com / admin123');
  console.log('   Almighty: almighty@company.com / almighty123');
  console.log('   HR Manager: hr.manager@company.com / manager123');
  console.log('   Finance Manager: finance.manager@company.com / manager123');
  console.log('   Sales Manager: sales.manager@company.com / manager123');
  console.log('   IT Manager: it.manager@company.com / manager123');
  console.log('   HR Employee 1: hr.emp1@company.com / employee123');
  console.log('   Finance Employee 1: finance.emp1@company.com / employee123');
  console.log('   Sales Employee 1: sales.emp1@company.com / employee123');
  console.log('   IT Employee 1: it.emp1@company.com / employee123');
}

main()
  .catch(e => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
