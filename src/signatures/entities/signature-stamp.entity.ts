import type { Signature, User } from '@prisma/client';

export interface SignatureStampEntity extends Signature {
  createdBy?: Partial<User>;
}

export interface SignatureStampWithCreator extends Signature {
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}
