import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { SignatureStampsRepository } from '../repositories/signature-stamps.repository';
import { S3Service } from '../../s3/s3.service';
import { CreateSignatureDto } from '../dto/create-signature.dto';
import { UpdateSignatureDto } from '../dto/update-signature.dto';
import { GetSignaturesQueryDto } from '../dto/get-signatures-query.dto';
import type { Signature } from '@prisma/client';
import type { SignatureStampWithCreator } from '../entities/signature-stamp.entity';

@Injectable()
export class SignatureStampsService {
  constructor(
    private readonly signatureStampsRepository: SignatureStampsRepository,
    private readonly s3Service: S3Service,
  ) {}

  async create(createSignatureDto: CreateSignatureDto, userId: string): Promise<Signature> {
    // Check if signature name already exists
    const existingSignature = await this.signatureStampsRepository.findByName(
      createSignatureDto.name,
    );
    if (existingSignature) {
      throw new ConflictException(
        `Signature stamp with name '${createSignatureDto.name}' already exists`,
      );
    }

    return this.signatureStampsRepository.create({
      name: createSignatureDto.name,
      description: createSignatureDto.description,
      imageUrl: createSignatureDto.imageUrl,
      s3Key: createSignatureDto.s3Key,
      createdById: userId,
    });
  }

  async findAll(
    query: GetSignaturesQueryDto,
  ): Promise<{ signatures: SignatureStampWithCreator[]; total: number; page: number; limit: number }> {
    const { signatures, total } = await this.signatureStampsRepository.findMany({
      search: query.search,
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });

    return {
      signatures,
      total,
      page: query.page || 1,
      limit: query.limit || 10,
    };
  }

  async findById(id: string): Promise<SignatureStampWithCreator> {
    const signature = await this.signatureStampsRepository.findById(id);
    if (!signature) {
      throw new NotFoundException(`Signature stamp with ID '${id}' not found`);
    }
    return signature;
  }

  async update(id: string, updateSignatureDto: UpdateSignatureDto): Promise<Signature> {
    // Check if signature exists
    const existingSignature = await this.signatureStampsRepository.findById(id);
    if (!existingSignature) {
      throw new NotFoundException(`Signature stamp with ID '${id}' not found`);
    }

    // Check if new name conflicts with existing signature
    if (updateSignatureDto.name && updateSignatureDto.name !== existingSignature.name) {
      const nameConflict = await this.signatureStampsRepository.findByName(updateSignatureDto.name);
      if (nameConflict) {
        throw new ConflictException(
          `Signature stamp with name '${updateSignatureDto.name}' already exists`,
        );
      }
    }

    return this.signatureStampsRepository.update(id, {
      name: updateSignatureDto.name,
      description: updateSignatureDto.description,
      isActive: updateSignatureDto.isActive,
    });
  }

  async delete(id: string): Promise<void> {
    const signature = await this.signatureStampsRepository.findById(id);
    if (!signature) {
      throw new NotFoundException(`Signature stamp with ID '${id}' not found`);
    }

    // Delete image from S3
    try {
      await this.s3Service.deleteFile(signature.s3Key);
    } catch (error) {
      // Log error but don't fail the deletion
      console.error(`Failed to delete signature image from S3: ${error}`);
    }

    await this.signatureStampsRepository.delete(id);
  }

  async getActiveSignatures(): Promise<SignatureStampWithCreator[]> {
    return this.signatureStampsRepository.findActiveSignatures();
  }

  async generatePresignedUrl(fileName: string, contentType: string): Promise<{
    presignedUrl: string;
    key: string;
    publicUrl: string;
  }> {
    return this.s3Service.generateSignaturePresignedUrl(fileName, contentType);
  }
}
