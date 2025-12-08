import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutBucketCorsCommand,
  GetBucketCorsCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
// import { v4 as uuidv4 } from 'uuid'; // Comment out static import

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    
    // Only throw error if not in development mode
    if (!accessKeyId || !secretAccessKey) {
      const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
      if (nodeEnv === 'production') {
        throw new Error('AWS credentials are not set in environment variables');
      }
      this.logger.warn('⚠️ AWS credentials not set - S3 features will be disabled');
      // Use dummy credentials for dev
      this.s3Client = null as any;
      this.bucketName = 'dev-bucket';
      return;
    }
    
    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    const bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME');
    if (!bucketName) {
      throw new Error('AWS_S3_BUCKET_NAME is not set in environment variables');
    }
    this.bucketName = bucketName;
  }

  async generatePresignedUrl(
    fileName: string,
    contentType: string,
    folder: string = 'uploads',
  ): Promise<{ presignedUrl: string; key: string; publicUrl: string }> {
    if (!this.s3Client) {
      throw new Error('S3 is not configured - AWS credentials missing');
    }
    
    const fileExtension = fileName.split('.').pop();
    const { v4: uuidv4 } = await import('uuid');
    const key = `${folder}/${uuidv4()}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 }); // 1 hour
    const publicUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

    this.logger.log(`Generated presigned URL for key: ${key}`);

    return {
      presignedUrl,
      key,
      publicUrl,
    };
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
    this.logger.log(`Deleted file with key: ${key}`);
  }

  async generateAvatarPresignedUrl(
    fileName: string,
    contentType: string,
  ): Promise<{ presignedUrl: string; key: string; publicUrl: string }> {
    return this.generatePresignedUrl(fileName, contentType, 'avatars');
  }

  async generateCoverPresignedUrl(
    fileName: string,
    contentType: string,
  ): Promise<{ presignedUrl: string; key: string; publicUrl: string }> {
    this.logger.log(`Generating cover presigned URL for file: ${fileName}`);
    return this.generatePresignedUrl(fileName, contentType, 'covers');
  }

  async generateDocumentPresignedUrl(
    fileName: string,
    contentType: string,
  ): Promise<{ presignedUrl: string; key: string; publicUrl: string }> {
    this.logger.log(`Generating document presigned URL for file: ${fileName}`);
    return this.generatePresignedUrl(fileName, contentType, 'documents');
  }

  async generateSignaturePresignedUrl(
    fileName: string,
    contentType: string,
  ): Promise<{ presignedUrl: string; key: string; publicUrl: string }> {
    this.logger.log(`Generating signature presigned URL for file: ${fileName}`);
    return this.generatePresignedUrl(fileName, contentType, 'signatures');
  }

  async getFile(key: string): Promise<{ body: any; contentType: string; contentLength: number }> {
    this.logger.log(`Getting file from S3: ${key}`);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        body: response.Body,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get file from S3: ${key}`, error);
      throw error;
    }
  }

  async generateSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    this.logger.log(`Generating signed download URL for: ${key}`);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

      this.logger.log(`Signed download URL generated for: ${key}`);
      return signedUrl;
    } catch (error) {
      this.logger.error(`Failed to generate signed download URL for: ${key}`, error);
      throw error;
    }
  }

  /**
   * Setup CORS policy for S3 bucket to allow frontend uploads
   */
  async setupCorsPolicy(): Promise<void> {
    try {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3030');
      const backendUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');

      const corsConfiguration = {
        CORSRules: [
          {
            AllowedOrigins: [
              frontendUrl.trim(),
              backendUrl.trim(),
              'http://localhost:3030',
              'http://localhost:3000'
            ],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            AllowedHeaders: [
              'Content-Type',
              'Content-MD5',
              'Content-Disposition',
              'x-amz-checksum-crc32',
              'x-amz-sdk-checksum-algorithm',
              'Authorization',
              'X-Amz-Date',
              'X-Amz-Security-Token',
              'x-amz-user-agent'
            ],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3000
          }
        ]
      };

      const command = new PutBucketCorsCommand({
        Bucket: this.bucketName,
        CORSConfiguration: corsConfiguration
      });

      await this.s3Client.send(command);
      this.logger.log(`CORS policy updated for bucket: ${this.bucketName}`);
    } catch (error) {
      this.logger.error(`Failed to setup CORS policy for bucket: ${this.bucketName}`, error);
      throw error;
    }
  }

  /**
   * Get current CORS policy
   */
  async getCorsPolicy(): Promise<any> {
    try {
      const command = new GetBucketCorsCommand({
        Bucket: this.bucketName
      });

      const response = await this.s3Client.send(command);
      return response.CORSRules;
    } catch (error) {
      this.logger.error(`Failed to get CORS policy for bucket: ${this.bucketName}`, error);
      throw error;
    }
  }
}
