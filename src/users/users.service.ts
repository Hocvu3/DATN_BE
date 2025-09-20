import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import type { User, Role, Department, Asset } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export interface UserEntity extends User {
  role: Role | null;
  department: Department | null;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { role: true, department: true },
    });
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        department: true,
        avatar: true,
        createdDocuments: {
          include: {
            tags: { include: { tag: true } },
            versions: true,
            attachments: true,
            assets: true,
            comments: {
              include: {
                author: { select: { id: true, email: true, firstName: true, lastName: true } },
              },
            },
            signatureRequests: { include: { signatures: true } },
            auditLogs: true,
          },
        },
        approvedDocuments: {
          include: {
            tags: { include: { tag: true } },
            versions: true,
            attachments: true,
            assets: true,
            comments: {
              include: {
                author: { select: { id: true, email: true, firstName: true, lastName: true } },
              },
            },
            signatureRequests: { include: { signatures: true } },
            auditLogs: true,
          },
        },
        createdVersions: {
          include: {
            document: {
              include: {
                tags: { include: { tag: true } },
                creator: { select: { id: true, email: true, firstName: true, lastName: true } },
              },
            },
          },
        },
        uploadedAttachments: {
          include: {
            document: {
              include: {
                tags: { include: { tag: true } },
                creator: { select: { id: true, email: true, firstName: true, lastName: true } },
              },
            },
          },
        },
        comments: {
          include: {
            document: {
              include: {
                tags: { include: { tag: true } },
                creator: { select: { id: true, email: true, firstName: true, lastName: true } },
              },
            },
          },
        },
        notifications: true,
        signatureRequests: {
          include: {
            document: {
              include: {
                tags: { include: { tag: true } },
                creator: { select: { id: true, email: true, firstName: true, lastName: true } },
              },
            },
            signatures: true,
          },
        },
        digitalSignatures: {
          include: {
            request: {
              include: {
                document: {
                  include: {
                    tags: { include: { tag: true } },
                    creator: { select: { id: true, email: true, firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
        },
        uploadedAssets: {
          include: {
            ownerDocument: {
              include: {
                tags: { include: { tag: true } },
                creator: { select: { id: true, email: true, firstName: true, lastName: true } },
              },
            },
            department: true,
          },
        },
        auditLogs: {
          include: {
            document: {
              include: {
                tags: { include: { tag: true } },
                creator: { select: { id: true, email: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
  }

  async validatePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async setRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    this.logger.log(`setRefreshToken: userId=${userId}, typeof=${typeof userId}`);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  async setPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async setResetPasswordToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { resetPasswordToken: token, resetPasswordExpires: expiresAt },
    });
  }

  async clearResetPasswordToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { resetPasswordToken: null, resetPasswordExpires: null },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const isCurrentPasswordValid = await this.validatePassword(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) throw new BadRequestException('Current password is incorrect');

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });
  }

  async updateProfile(
    userId: string,
    updateData: {
      firstName?: string;
      lastName?: string;
      email?: string;
      username?: string;
    },
  ): Promise<UserEntity> {
    // Check if email is already taken by another user
    if (updateData.email) {
      const existingUser = await this.findByEmail(updateData.email);
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Email is already taken');
      }
    }

    // Check if username is already taken by another user
    if (updateData.username) {
      const existingUser = await this.prisma.user.findUnique({
        where: { username: updateData.username },
      });
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Username is already taken');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { role: true, department: true, avatar: true },
    });

    return updatedUser;
  }

  async updateAvatar(userId: string, assetId: string): Promise<UserEntity> {
    // First, remove current avatar
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: { disconnect: true } },
    });

    // Set new avatar
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: { connect: { id: assetId } } },
      include: { role: true, department: true, avatar: true },
    });

    return updatedUser;
  }

  async removeAvatar(userId: string): Promise<UserEntity> {
    // Get current user with avatar
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { avatar: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // If user has an avatar, delete it from S3
    if (user.avatar) {
      try {
        // Extract key from S3 URL
        const s3Url = user.avatar.s3Url;
        const key = s3Url.split('.com/')[1]; // Extract key from full URL
        await this.s3Service.deleteFile(key);
        this.logger.log(`Deleted avatar file from S3: ${key}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to delete avatar from S3: ${errorMessage}`);
        // Continue with database cleanup even if S3 deletion fails
      }

      // Delete asset record from database
      await this.prisma.asset.delete({
        where: { id: user.avatar.id },
      });
    }

    // Remove avatar relation from user
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: { disconnect: true } },
      include: { role: true, department: true, avatar: true },
    });

    return updatedUser;
  }

  async createAsset(data: {
    filename: string;
    s3Url: string;
    contentType: string;
    sizeBytes?: number;
    uploadedById: string;
    departmentId?: string;
  }): Promise<Asset> {
    return await this.prisma.asset.create({
      data: {
        filename: data.filename,
        s3Url: data.s3Url,
        contentType: data.contentType,
        sizeBytes: data.sizeBytes ? BigInt(data.sizeBytes) : null,
        uploadedBy: { connect: { id: data.uploadedById } },
        department: data.departmentId ? { connect: { id: data.departmentId } } : undefined,
      },
    });
  }
}
