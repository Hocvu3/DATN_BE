import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
// import { v4 as uuidv4 } from 'uuid'; // Comment out static import

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials are not set in environment variables');
    }
    this.s3Client = new S3Client({
      region,
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
    const fileExtension = fileName.split('.').pop();
    const { v4: uuidv4 } = await import('uuid');
    const key = `${folder}/${uuidv4()}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 }); // 1 hour
    const publicUrl = `https://${this.bucketName}.s3.amazonaws.com/${key}`;

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
}
