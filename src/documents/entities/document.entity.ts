import type {
  Document,
  DocumentVersion,
  Asset,
  Tag,
  Comment,
  SignatureRequest,
  DigitalSignature,
  User,
  Department,
} from '@prisma/client';

export interface DocumentEntity extends Document {
  creator: User;
  approver?: User | null;
  department?: Department | null;
  versions: DocumentVersion[];
  assets: Asset[];
  tags: Array<{
    id: string;
    tag: Tag;
  }>;
  comments: Array<{
    id: string;
    content: string;
    isInternal: boolean;
    createdAt: Date;
    author: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
  }>;
  signatureRequests: Array<{
    id: string;
    status: string;
    requestedAt: Date;
    signedAt?: Date | null;
    expiresAt: Date;
    signatureType: string;
    reason?: string | null;
    signatures: DigitalSignature[];
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    resource: string;
    resourceId: string;
    details?: any;
    ipAddress?: string | null;
    userAgent?: string | null;
    timestamp: Date;
  }>;
}

export interface DocumentVersionEntity extends DocumentVersion {
  document: Document;
  creator: User;
}

export interface DocumentAssetEntity extends Asset {
  ownerDocument?: Document | null;
  uploadedBy?: User | null;
  department?: Department | null;
}

export interface DocumentTagEntity {
  id: string;
  document: Document;
  tag: Tag;
}

export interface DocumentCommentEntity {
  id: string;
  content: string;
  isInternal: boolean;
  createdAt: Date;
  updatedAt: Date;
  document: Document;
  author: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface DocumentSignatureRequestEntity {
  id: string;
  status: string;
  requestedAt: Date;
  signedAt?: Date | null;
  expiresAt: Date;
  signatureType: string;
  reason?: string | null;
  document: Document;
  requester: User;
  signatures: DigitalSignature[];
}

export interface DocumentAuditLogEntity {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  details?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp: Date;
  user?: User | null;
  document?: Document | null;
}
