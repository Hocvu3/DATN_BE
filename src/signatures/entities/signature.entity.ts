import type { SignatureRequest, DigitalSignature, User, DocumentVersion } from '@prisma/client';

export interface SignatureRequestEntity extends SignatureRequest {
  requester: User;
}

export interface DigitalSignatureEntity extends DigitalSignature {
  documentVersion: DocumentVersion;
  signer: User;
}

export interface SignatureRequestWithDetails extends SignatureRequest {
  requester: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface SignatureStats {
  totalRequests: number;
  pendingRequests: number;
  signedRequests: number;
  expiredRequests: number;
  rejectedRequests: number;
}
