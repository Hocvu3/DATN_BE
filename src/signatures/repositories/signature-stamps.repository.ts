import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Signature } from '@prisma/client';
import type { SignatureStampWithCreator } from '../entities/signature-stamp.entity';

interface FindManyOptions {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class SignatureStampsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    name: string;
    description?: string;
    imageUrl: string;
    s3Key: string;
    createdById: string;
  }): Promise<Signature> {
    return this.prisma.signature.create({
      data: {
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
        s3Key: data.s3Key,
        createdById: data.createdById,
      },
    });
  }

  async findMany(options: FindManyOptions): Promise<{
    signatures: SignatureStampWithCreator[];
    total: number;
  }> {
    const { search, isActive, page = 1, limit = 10 } = options;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [signatures, total] = await Promise.all([
      this.prisma.signature.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.signature.count({ where }),
    ]);

    return { signatures, total };
  }

  async findById(id: string): Promise<SignatureStampWithCreator | null> {
    return this.prisma.signature.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async findByName(name: string): Promise<Signature | null> {
    return this.prisma.signature.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
    },
  ): Promise<Signature> {
    return this.prisma.signature.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.signature.delete({
      where: { id },
    });
  }

  async findActiveSignatures(): Promise<SignatureStampWithCreator[]> {
    return this.prisma.signature.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }
}
