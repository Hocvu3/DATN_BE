import type { Tag, DocumentTag, Document } from '@prisma/client';

export interface TagEntity extends Tag {
  _count?: {
    documents: number;
  };
}

export interface DocumentTagEntity extends DocumentTag {
  document?: Document | null;
  tag: Tag;
}

export interface TagWithDocumentCount extends Tag {
  documentCount: number;
  _count?: {
    documents: number;
  };
}
