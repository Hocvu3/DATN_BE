import type { Tag, DocumentTag, Document } from '@prisma/client';

export interface TagEntity extends Tag {
  documents: Array<{
    id: string;
    document: Document;
  }>;
}

export interface DocumentTagEntity extends DocumentTag {
  document: Document;
  tag: Tag;
}

export interface TagWithDocumentCount extends Tag {
  documentCount: number;
}
