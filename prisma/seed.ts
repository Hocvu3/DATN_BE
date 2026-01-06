import { PrismaClient, DocumentStatus, SecurityLevel } from '@prisma/client';
import bcrypt from 'bcrypt';
import { it } from 'node:test';

const databaseUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

async function main(): Promise<void> {
  console.log('🌱 Starting refactored database seeding...');

  // Clean existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.digitalSignature.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.documentTag.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.signatureRequest.deleteMany();
  await prisma.document.deleteMany();
  await prisma.signature.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.role.deleteMany();

  // ===== 1. CREATE ROLES =====
  console.log('📝 Creating roles...');
  const adminRole = await prisma.role.create({
    data: {
      name: 'ADMIN',
      description: 'System Administrator',
      permissions: ['*'],
    },
  });

  const managerRole = await prisma.role.create({
    data: {
      name: 'MANAGER',
      description: 'Department Manager',
      permissions: ['document:read:all', 'document:approve', 'user:read:dept'],
    },
  });

  const employeeRole = await prisma.role.create({
    data: {
      name: 'EMPLOYEE',
      description: 'Regular Employee',
      permissions: ['document:read:own', 'document:create'],
    },
  });

  // ===== 2. CREATE DEPARTMENTS =====
  console.log('🏢 Creating departments...');
  const itDept = await prisma.department.create({
    data: {
      name: 'IT Department',
      description: 'Information Technology',
    },
  });

  const hrDept = await prisma.department.create({
    data: {
      name: 'HR Department',
      description: 'Human Resources',
    },
  });

  const financeDept = await prisma.department.create({
    data: {
      name: 'Finance Department',
      description: 'Finance and Accounting',
    },
  });

  // ===== 3. CREATE USERS =====
  console.log('👥 Creating users...');
  const hashedPassword = await bcrypt.hash('hocvu123', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'hocvu2003@gmail.com',
      username: 'admin',
      passwordHash: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      roleId: adminRole.id,
      departmentId: itDept.id,
    },
  });

  const manager1 = await prisma.user.create({
    data: {
      email: 'manager.it@gmail.com',
      username: 'manager_it',
      passwordHash: hashedPassword,
      firstName: 'John',
      lastName: 'Manager',
      roleId: managerRole.id,
      departmentId: itDept.id,
    },
  });

  const manager2 = await prisma.user.create({
    data: {
      email: 'manager.hr@gmail.com',
      username: 'manager_hr',
      passwordHash: hashedPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      roleId: managerRole.id,
      departmentId: hrDept.id,
    },
  });

  const employee1 = await prisma.user.create({
    data: {
      email: 'employee.it@gmail.com',
      username: 'employee1',
      passwordHash: hashedPassword,
      firstName: 'Alice',
      lastName: 'Developer',
      roleId: employeeRole.id,
      departmentId: itDept.id,
    },
  });

  const employee2 = await prisma.user.create({
    data: {
      email: 'employee.finance@gmail.com',
      username: 'employee2',
      passwordHash: hashedPassword,
      firstName: 'Bob',
      lastName: 'Analyst',
      roleId: employeeRole.id,
      departmentId: financeDept.id,
    },
  });

  // Dummy users
  await prisma.user.create({
    data: {
      email: 'employee.example1@gmail.com',
      username: 'employee_example1',
      passwordHash: hashedPassword,
      firstName: 'Bob',
      lastName: 'Analyst',
      roleId: employeeRole.id,
      departmentId: financeDept.id,
      isActive: false,
    },
  });

   await prisma.user.create({
    data: {
      email: 'employee.example2@gmail.com',
      username: 'employee_example2',
      passwordHash: hashedPassword,
      firstName: 'Bob',
      lastName: 'Analyst',
      roleId: employeeRole.id,
      departmentId: itDept.id,
      isActive: false,
    },
  });

   await prisma.user.create({
    data: {
      email: 'employee.example3@gmail.com',
      username: 'employee_example3',
      passwordHash: hashedPassword,
      firstName: 'Bob',
      lastName: 'Analyst',
      roleId: employeeRole.id,
      departmentId: financeDept.id,
      isActive: false,
    },
  });

  // ===== 4. CREATE SIGNATURE STAMPS =====
  console.log('✍️ Creating signature stamps...');
  const stamp1 = await prisma.signature.create({
    data: {
      name: 'Admin Approval Stamp',
      description: 'Official admin approval signature',
      imageUrl: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/signatures/acb6ec44-354d-4a8f-a173-17dbe429e8e9.png',
      s3Key: 'signatures/admin-stamp.png',
      createdById: adminUser.id,
    },
  });

  const stamp2 = await prisma.signature.create({
    data: {
      name: 'Manager Stamp',
      description: 'Department manager signature',
      imageUrl: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/signatures/acb6ec44-354d-4a8f-a173-17dbe429e8e9.png',
      s3Key: 'signatures/manager-stamp.png',
      createdById: manager1.id,
    },
  });

  await prisma.signature.create({
    data: {
      name: 'Manager Stamp',
      description: 'Department manager signature',
      imageUrl: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/signatures/acb6ec44-354d-4a8f-a173-17dbe429e8e9.png',
      s3Key: 'signatures/manager-stamp.png',
      createdById: manager1.id,
      isActive: false,
    },
  });

  // ===== 5. CREATE TAGS =====
  console.log('🏷️ Creating tags...');
  const urgentTag = await prisma.tag.create({
    data: {
      name: 'Urgent',
      color: '#ff4d4f',
      description: 'Requires immediate attention',
    },
  });

  const confidentialTag = await prisma.tag.create({
    data: {
      name: 'Confidential',
      color: '#722ed1',
      description: 'Confidential document',
    },
  });

  const financialTag = await prisma.tag.create({
    data: {
      name: 'Financial',
      color: '#52c41a',
      description: 'Financial document',
    },
  });

  await prisma.tag.create({
    data: {
      name: 'Obsolete',
      color: '#8c8c8c',
      description: 'Outdated document',
      isActive: false,
    },
  });

  // ===== 6. CREATE DOCUMENTS WITH MULTIPLE VERSIONS =====
  console.log('📄 Creating documents with multiple versions...');

  // Document 1: IT Infrastructure Plan (3 versions)
  const doc1 = await prisma.document.create({
    data: {
      title: 'IT Infrastructure Plan 2025',
      description: 'Comprehensive IT infrastructure upgrade plan',
      documentNumber: 'IT-2025-001',
      securityLevel: SecurityLevel.INTERNAL,
      creatorId: employee1.id,
      departmentId: itDept.id,
    },
  });

  // Version 1 - DRAFT
  await prisma.documentVersion.create({
    data: {
      documentId: doc1.id,
      versionNumber: 1,
      filePath: '/documents/it-infra-v1.pdf',
      s3Key: 'documents/it-infra-v1.pdf',
      s3Url: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/documents/3eb821ae-613b-4743-901b-d27a6d8c5645.pdf',
      thumbnailUrl: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/documents/3eb821ae-613b-4743-901b-d27a6d8c5645.pdf',
      fileSize: 1024000,
      checksum: 'abc123def456',
      mimeType: 'application/pdf',
      status: DocumentStatus.DRAFT,
      creatorId: employee1.id,
    },
  });

  // Version 2 - PENDING_APPROVAL
  await prisma.documentVersion.create({
    data: {
      documentId: doc1.id,
      versionNumber: 2,
      filePath: '/documents/it-infra-v2.pdf',
      s3Key: 'documents/it-infra-v2.pdf',
      s3Url: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/documents/3eb821ae-613b-4743-901b-d27a6d8c5645.pdf',
      thumbnailUrl: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/documents/3eb821ae-613b-4743-901b-d27a6d8c5645.pdf',
      fileSize: 1048576,
      checksum: 'def456ghi789',
      mimeType: 'application/pdf',
      status: DocumentStatus.PENDING_APPROVAL,
      creatorId: employee1.id,
    },
  });

  // Version 3 - APPROVED (with signature)
  const doc1v3 = await prisma.documentVersion.create({
    data: {
      documentId: doc1.id,
      versionNumber: 3,
      filePath: '/documents/it-infra-v3.pdf',
      s3Key: 'documents/it-infra-v3.pdf',
      s3Url: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/documents/3eb821ae-613b-4743-901b-d27a6d8c5645.pdf',
      thumbnailUrl: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/documents/3eb821ae-613b-4743-901b-d27a6d8c5645.pdf',
      fileSize: 1100000,
      checksum: 'ghi789jkl012',
      mimeType: 'application/pdf',
      status: DocumentStatus.APPROVED,
      creatorId: employee1.id,
    },
  });

  // Add signature to version 3
  await prisma.digitalSignature.create({
    data: {
      documentVersionId: doc1v3.id,
      signerId: manager1.id,
      signatureStampId: stamp2.id,
      documentHash: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
      signatureHash: 'z6y5x4w3v2u1t0s9r8q7p6o5n4m3l2k1j0i9h8g7f6e5d4c3b2a1',
      signatureStatus: 'VALID',
      signatureData: JSON.stringify({
        stampName: stamp2.name,
        stampImageUrl: stamp2.imageUrl,
        appliedAt: new Date().toISOString(),
        versionNumber: 3,
      }),
      verifiedAt: new Date(),
    },
  });

  // Cover image for document 1
  await prisma.asset.create({
    data: {
      filename: 'it-infra-cover.jpg',
      s3Url: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/covers/8de87450-c477-48b5-b6e3-370029b63b4b.jpg',
      contentType: 'image/jpeg',
      sizeBytes: '51200',
      isCover: true,
      ownerDocumentId: doc1.id,
      uploadedById: employee1.id,
    },
  });

  // Document 2: Annual Budget Report (4 versions)
  const doc2 = await prisma.document.create({
    data: {
      title: 'Annual Budget Report 2024',
      description: 'Financial report for fiscal year 2024',
      documentNumber: 'FIN-2024-Q1',
      securityLevel: SecurityLevel.CONFIDENTIAL,
      isConfidential: true,
      creatorId: employee2.id,
      departmentId: financeDept.id,
    },
  });

  const doc2Versions: any[] = [];
  for (let i = 1; i <= 4; i++) {
    const status = i === 1 ? DocumentStatus.DRAFT :
                   i === 2 ? DocumentStatus.DRAFT :
                   i === 3 ? DocumentStatus.PENDING_APPROVAL :
                   DocumentStatus.APPROVED;
    
    const version = await prisma.documentVersion.create({
      data: {
        documentId: doc2.id,
        versionNumber: i,
        filePath: `/documents/budget-v${i}.pdf`,
        s3Key: `documents/budget-v${i}.pdf`,
        s3Url: `https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/documents/3eb821ae-613b-4743-901b-d27a6d8c5645.pdf`,
        thumbnailUrl: `https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/documents/3eb821ae-613b-4743-901b-d27a6d8c5645.pdf`,
        fileSize: 2000000 + (i * 100000),
        checksum: `budget-checksum-v${i}`,
        mimeType: 'application/pdf',
        status,
        creatorId: employee2.id,
      },
    });
    doc2Versions.push(version);
  }

  // Add signature to version 4
  await prisma.digitalSignature.create({
    data: {
      documentVersionId: doc2Versions[3].id,
      signerId: adminUser.id,
      signatureStampId: stamp1.id,
      documentHash: 'budget2024hash123456789',
      signatureHash: 'budget2024sig987654321',
      signatureStatus: 'VALID',
      signatureData: JSON.stringify({
        stampName: stamp1.name,
        stampImageUrl: stamp1.imageUrl,
        appliedAt: new Date().toISOString(),
        versionNumber: 4,
      }),
      verifiedAt: new Date(),
    },
  });

  await prisma.asset.create({
    data: {
      filename: 'budget-cover.jpg',
      s3Url: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/covers/8de87450-c477-48b5-b6e3-370029b63b4b.jpg',
      contentType: 'image/jpeg',
      sizeBytes: '48000',
      isCover: true,
      ownerDocumentId: doc2.id,
      uploadedById: employee2.id,
    },
  });

  // Document 3: Employee Handbook (2 versions)
  const doc3 = await prisma.document.create({
    data: {
      title: 'Employee Handbook 2025',
      description: 'Company policies and procedures',
      documentNumber: 'HR-2024-002',
      securityLevel: SecurityLevel.INTERNAL,
      creatorId: manager2.id,
      departmentId: hrDept.id,
    },
  });

  const doc3v1 = await prisma.documentVersion.create({
    data: {
      documentId: doc3.id,
      versionNumber: 1,
      filePath: '/documents/handbook-v1.pdf',
      s3Key: 'documents/handbook-v1.pdf',
      s3Url: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/documents/handbook-v1.pdf',
      thumbnailUrl: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/thumbnails/handbook-v1.jpg',
      fileSize: 3500000,
      checksum: 'handbook-v1-checksum',
      mimeType: 'application/pdf',
      status: DocumentStatus.APPROVED,
      creatorId: manager2.id,
    },
  });

  const doc3v2 = await prisma.documentVersion.create({
    data: {
      documentId: doc3.id,
      versionNumber: 2,
      filePath: '/documents/handbook-v2.pdf',
      s3Key: 'documents/handbook-v2.pdf',
      s3Url: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/documents/handbook-v2.pdf',
      thumbnailUrl: 'https://dms-storage-bucket-68688686.s3.ap-southeast-2.amazonaws.com/thumbnails/handbook-v2.jpg',
      fileSize: 3600000,
      checksum: 'handbook-v2-checksum',
      mimeType: 'application/pdf',
      status: DocumentStatus.APPROVED,
      creatorId: manager2.id,
    },
  });

  // Add signatures to both versions
  await prisma.digitalSignature.create({
    data: {
      documentVersionId: doc3v1.id,
      signerId: adminUser.id,
      signatureStampId: stamp1.id,
      documentHash: 'handbookv1hash',
      signatureHash: 'handbookv1sig',
      signatureStatus: 'VALID',
      signatureData: JSON.stringify({
        stampName: stamp1.name,
        stampImageUrl: stamp1.imageUrl,
        appliedAt: new Date().toISOString(),
        versionNumber: 1,
      }),
      verifiedAt: new Date(),
    },
  });

  await prisma.digitalSignature.create({
    data: {
      documentVersionId: doc3v2.id,
      signerId: manager2.id,
      signatureStampId: stamp2.id,
      documentHash: 'handbookv2hash',
      signatureHash: 'handbookv2sig',
      signatureStatus: 'VALID',
      signatureData: JSON.stringify({
        stampName: stamp2.name,
        stampImageUrl: stamp2.imageUrl,
        appliedAt: new Date().toISOString(),
        versionNumber: 2,
      }),
      verifiedAt: new Date(),
    },
  });

  // ===== 7. ADD TAGS TO DOCUMENTS =====
  console.log('🏷️ Adding tags to documents...');
  await prisma.documentTag.createMany({
    data: [
      { documentId: doc1.id, tagId: urgentTag.id },
      { documentId: doc2.id, tagId: financialTag.id },
      { documentId: doc2.id, tagId: confidentialTag.id },
      { documentId: doc3.id, tagId: urgentTag.id },
    ],
  });

  // ===== 8. ADD COMMENTS =====
  console.log('💬 Adding comments...');
  await prisma.comment.createMany({
    data: [
      {
        documentId: doc1.id,
        authorId: manager1.id,
        content: 'Version 3 looks good, approved!',
      },
      {
        documentId: doc2.id,
        authorId: adminUser.id,
        content: 'Financial data verified and approved.',
      },
      {
        documentId: doc3.id,
        authorId: employee1.id,
        content: 'Great handbook, very comprehensive.',
      },
    ],
  });

  // ===== 9. ADD NOTIFICATIONS =====
  console.log('🔔 Adding notifications...');
  await prisma.notification.createMany({
    data: [
      {
        type: 'SIGNATURE_COMPLETED',
        title: 'Document Signed',
        message: `${doc1.title} version 3 has been signed`,
        recipientId: employee1.id,
      },
      {
        type: 'APPROVAL_GRANTED',
        title: 'Document Approved',
        message: `${doc2.title} version 4 has been approved`,
        recipientId: employee2.id,
      },
    ],
  });

  //10. Add Signature Request
  console.log('🖋️ Adding signature requests...');
  await prisma.signatureRequest.create({
    data: {
      documentVersionId: doc2Versions[2].id,
      requesterId: employee2.id,
      status: 'PENDING',
      requestedAt: new Date(),
      signedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week later
      signatureType: 'DIGITAL',
    },
  });

  await prisma.signatureRequest.create({
    data: {
      documentVersionId: doc3v2.id,
      requesterId: manager2.id,
      status: 'PENDING',
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week later
      signatureType: 'DIGITAL',
    },
  });

  await prisma.signatureRequest.create({
    data: {
      documentVersionId: doc1v3.id,
      requesterId: employee1.id,
      status: 'SIGNED',
      requestedAt: new Date(),
      signedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week later
      signatureType: 'DIGITAL',
    },
  });

  await prisma.signatureRequest.create({
    data: {
      documentVersionId: doc3v1.id,
      requesterId: manager2.id,
      status: 'PENDING',
      requestedAt: new Date(),
      signedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week later
      signatureType: 'DIGITAL',
    },
  });

  await prisma.signatureRequest.create({
    data: {
      documentVersionId: doc2Versions[3].id,
      requesterId: adminUser.id,
      status: 'EXPIRED',
      requestedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      expiresAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      signatureType: 'DIGITAL',
    },
  });

  await prisma.signatureRequest.create({
    data: {
      documentVersionId: doc1v3.id,
      requesterId: employee1.id,
      status: 'PENDING',
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week later
      signatureType: 'DIGITAL',
    },
  });

  await prisma.signatureRequest.create({
    data: {
      documentVersionId: doc3v2.id,
      requesterId: manager2.id,
      status: 'SIGNED',
      requestedAt: new Date(),
      signedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week later
      signatureType: 'DIGITAL',
    },
  });

  console.log('✅ Seed completed successfully!');
  console.log(`
📊 Summary:
   - Roles: 3
   - Departments: 3
   - Users: 5
   - Documents: 3
   - Document Versions: 9
   - Digital Signatures: 4
   - Signature Stamps: 2
   - Tags: 3
   - Comments: 3
   - Notifications: 2
   - Signature Requests: 9
  `);
  
  console.log('');
  console.log('🔐 Default Login Credentials:');
  console.log('   Admin: hocvu2003@gmail.com / hocvu123');
  console.log('   IT Manager: manager.it@gmail.com / hocvu123');
  console.log('   HR Manager: manager.hr@gmail.com / hocvu123');
  console.log('   Employee 1: employee1@gmail.com / hocvu123');
  console.log('   Employee 2: employee2@gmail.com / hocvu123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
