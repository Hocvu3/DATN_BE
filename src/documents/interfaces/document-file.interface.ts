export interface IFileUploadResponse {
  presignedUrl: string;
  key: string;
  publicUrl: string;
}

export interface IAssetData {
  s3Key: string;
  filename: string;
  contentType: string;
  sizeBytes?: number;
  isCover?: boolean;
}
