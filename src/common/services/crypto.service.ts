import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { S3Service } from 'src/s3/s3.service';

@Injectable()
export class CryptoService {
  private privateKey: string;
  private publicKey: string;

  constructor(
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
  ) {
    // Load keys from environment variables
    const privateKey = this.configService.get<string>('SIGNATURE_PRIVATE_KEY');
    const publicKey = this.configService.get<string>('SIGNATURE_PUBLIC_KEY');

    if (!privateKey || !publicKey) {
      throw new Error(
        'SIGNATURE_PRIVATE_KEY and SIGNATURE_PUBLIC_KEY must be set in environment variables',
      );
    }

    // Parse JSON strings if they are stored as JSON
    this.privateKey = privateKey.startsWith('"')
      ? JSON.parse(privateKey)
      : privateKey;
    this.publicKey = publicKey.startsWith('"')
      ? JSON.parse(publicKey)
      : publicKey;
  }

  /**
   * Generate SHA-256 hash of a buffer (e.g., PDF file content)
   */
  generateHash(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate SHA-256 hash of a file from S3
   */
  async generateHashFromS3(s3Key: string): Promise<string> {
    const fileBuffer = await this.s3Service.getFileBuffer(s3Key);
    return this.generateHash(fileBuffer);
  }

  /**
   * Sign a hash using RSA private key
   */
  signHash(hash: string): string {
    const sign = crypto.createSign('SHA256');
    sign.update(hash);
    sign.end();
    const signature = sign.sign(this.privateKey, 'base64');
    return signature;
  }

  /**
   * Verify a signature using RSA public key
   */
  verifySignature(hash: string, signature: string): boolean {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(hash);
      verify.end();
      return verify.verify(this.publicKey, signature, 'base64');
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Complete workflow: Hash file from S3 and sign it
   */
  async hashAndSignFile(s3Key: string): Promise<{ hash: string; signature: string }> {
    const hash = await this.generateHashFromS3(s3Key);
    const signature = this.signHash(hash);
    return { hash, signature };
  }

  /**
   * Complete workflow: Verify file integrity and signature
   */
  async verifyFileSignature(
    s3Key: string,
    originalHash: string,
    signature: string,
  ): Promise<{ isValid: boolean; currentHash: string; hashMatch: boolean }> {
    const currentHash = await this.generateHashFromS3(s3Key);
    const hashMatch = currentHash === originalHash;
    const signatureValid = this.verifySignature(originalHash, signature);
    
    return {
      isValid: hashMatch && signatureValid,
      currentHash,
      hashMatch,
    };
  }

  /**
   * Get public key for client-side operations
   */
  getPublicKey(): string {
    return this.publicKey;
  }
}
