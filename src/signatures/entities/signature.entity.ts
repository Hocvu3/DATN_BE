import type { SignatureRequest, DigitalSignature, User, Document } from '@prisma/client';

export interface SignatureRequestEntity extends SignatureRequest {
  document: Document;
  requester: User;
  signatures: DigitalSignatureEntity[];
}

export interface DigitalSignatureEntity extends DigitalSignature {
  request: SignatureRequest;
  signer: User;
}

export interface SignatureRequestWithDetails extends SignatureRequest {
  document: {
    id: string;
    title: string;
    documentNumber: string;
    version: number;
  };
  requester: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  signatures: Array<{
    id: string;
    signedAt: Date;
    signer: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
  }>;
}

export interface SignatureStats {
  totalRequests: number;
  pendingRequests: number;
  signedRequests: number;
  expiredRequests: number;
  rejectedRequests: number;
}
