import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
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
  ) { }

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
      },
    });
  }

  async findByIdWithRelations(id: string): Promise<UserEntity | null> {
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
    await this.prisma.runWithUserContext({ userId, role: null, departmentId: null }, async tx => {
      await tx.user.update({
        where: { id: userId },
        data: { refreshTokenHash },
      });
    });
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.prisma.runWithUserContext({ userId, role: null, departmentId: null }, async tx => {
      await tx.user.update({
        where: { id: userId },
        data: { refreshTokenHash: null },
      });
    });
  }

  async setPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.runWithUserContext({ userId, role: null, departmentId: null }, async tx => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
    });
  }

  async setResetPasswordToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await this.prisma.runWithUserContext({ userId, role: null, departmentId: null }, async tx => {
      await tx.user.update({
        where: { id: userId },
        data: { resetPasswordToken: token, resetPasswordExpires: expiresAt },
      });
    });
  }

  async clearResetPasswordToken(userId: string): Promise<void> {
    await this.prisma.runWithUserContext({ userId, role: null, departmentId: null }, async tx => {
      await tx.user.update({
        where: { id: userId },
        data: { resetPasswordToken: null, resetPasswordExpires: null },
      });
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
    await this.prisma.runWithUserContext({ userId, role: null, departmentId: null }, async tx => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });
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

    const updatedUser = await this.prisma.runWithUserContext(
      { userId, role: null, departmentId: null },
      async tx => {
        return tx.user.update({
          where: { id: userId },
          data: updateData,
          include: { role: true, department: true, avatar: true },
        });
      },
    );

    return updatedUser;
  }

  async updateAvatar(userId: string, assetId: string): Promise<UserEntity> {
    // First, remove current avatar
    await this.prisma.runWithUserContext({ userId, role: null, departmentId: null }, async tx => {
      await tx.user.update({
        where: { id: userId },
        data: { avatar: { disconnect: true } },
      });
    });

    // Set new avatar
    const updatedUser = await this.prisma.runWithUserContext(
      { userId, role: null, departmentId: null },
      async tx => {
        return tx.user.update({
          where: { id: userId },
          data: { avatar: { connect: { id: assetId } } },
          include: { role: true, department: true, avatar: true },
        });
      },
    );

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
      await this.prisma.runWithUserContext({ userId, role: null, departmentId: null }, async tx => {
        await tx.asset.delete({
          where: { id: user.avatar!.id },
        });
      });
    }

    // Remove avatar relation from user
    const updatedUser = await this.prisma.runWithUserContext(
      { userId, role: null, departmentId: null },
      async tx => {
        return tx.user.update({
          where: { id: userId },
          data: { avatar: { disconnect: true } },
          include: { role: true, department: true, avatar: true },
        });
      },
    );

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
    return await this.prisma.runWithUserContext(
      { userId: data.uploadedById, role: null, departmentId: data.departmentId || null },
      async tx => {
        return tx.asset.create({
          data: {
            filename: data.filename,
            s3Url: data.s3Url,
            contentType: data.contentType,
            sizeBytes: data.sizeBytes ? data.sizeBytes.toString() : null,
            uploadedBy: { connect: { id: data.uploadedById } },
            department: data.departmentId ? { connect: { id: data.departmentId } } : undefined,
          },
        });
      },
    );
  }

  // ===== USER MANAGEMENT CRUD =====
  async createUser(data: {
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    password: string;
    roleId: string;
    departmentId?: string;
    isActive?: boolean;
  }): Promise<UserEntity> {
    // Check if email already exists
    const existingUser = await this.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Check if username is taken
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username is already taken');
    }

    // Check if role exists
    const role = await this.prisma.role.findUnique({
      where: { id: data.roleId },
    });
    if (!role) {
      throw new BadRequestException('Invalid role ID');
    }

    // Check if department exists (if provided)
    if (data.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: data.departmentId },
      });
      if (!department) {
        throw new BadRequestException('Invalid department ID');
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user
    const user = await this.prisma.runWithUserContext(
      { userId: undefined, role: null, departmentId: data.departmentId || null },
      async tx => {
        return tx.user.create({
          data: {
            email: data.email,
            username: data.username,
            firstName: data.firstName,
            lastName: data.lastName,
            passwordHash,
            roleId: data.roleId,
            departmentId: data.departmentId,
            isActive: data.isActive ?? true,
          },
          include: { role: true, department: true },
        });
      },
    );

    this.logger.log(`User created: ${data.email}`);
    return user;
  }

  async getUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    department?: string;
    isActive?: boolean;
  }): Promise<{
    users: UserEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Debug logging
    this.logger.log(`getUsers called with query:`, JSON.stringify(query, null, 2));

    // Ensure page and limit are proper numbers
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { username: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.role) {
      where.role = { name: { equals: query.role, mode: 'insensitive' } };
    }

    if (query.department) {
      where.department = { name: { equals: query.department, mode: 'insensitive' } };
    }

    if (query.isActive !== undefined) {
      // Handle both string and boolean values
      let isActiveValue: boolean;
      if (typeof query.isActive === 'string') {
        isActiveValue = query.isActive === 'true';
      } else {
        isActiveValue = Boolean(query.isActive);
      }
      where.isActive = isActiveValue;
      this.logger.log(
        `Filtering by isActive: ${query.isActive} (${typeof query.isActive}) -> ${where.isActive}`,
      );
    }

    // Debug final where clause
    this.logger.log(`Final where clause:`, JSON.stringify(where, null, 2));

    // Get users with pagination
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { role: true, department: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      users,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getUserById(id: string): Promise<UserEntity> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateUser(
    id: string,
    data: {
      email?: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      roleId?: string;
      departmentId?: string;
      isActive?: boolean;
    },
  ): Promise<UserEntity> {
    // Check if user exists
    const existingUser = await this.findById(id);
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    // Check if email is already taken by another user
    if (data.email && data.email !== existingUser.email) {
      const emailUser = await this.findByEmail(data.email);
      if (emailUser) {
        throw new ConflictException('Email is already taken');
      }
    }

    // Check if username is already taken by another user
    if (data.username && data.username !== existingUser.username) {
      const usernameUser = await this.prisma.user.findUnique({
        where: { username: data.username },
      });
      if (usernameUser) {
        throw new ConflictException('Username is already taken');
      }
    }

    // Check if role exists
    if (data.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: data.roleId },
      });
      if (!role) {
        throw new BadRequestException('Invalid role ID');
      }
    }

    // Check if department exists (if provided)
    if (data.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: data.departmentId },
      });
      if (!department) {
        throw new BadRequestException('Invalid department ID');
      }
    }

    // Update user
    const updatedUser = await this.prisma.runWithUserContext(
      { userId: id, role: null, departmentId: data.departmentId || null },
      async tx => {
        return tx.user.update({
          where: { id },
          data,
          include: { role: true, department: true },
        });
      },
    );

    this.logger.log(`User updated: ${updatedUser.email}`);
    return updatedUser;
  }

  async deleteUser(id: string): Promise<void> {
    // Check if user exists
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user has any related data that would prevent deletion
    const [documentsCount, commentsCount] = await Promise.all([
      this.prisma.document.count({ where: { creatorId: id } }),
      this.prisma.comment.count({ where: { authorId: id } }),
    ]);

    if (documentsCount > 0 || commentsCount > 0) {
      throw new BadRequestException(
        'Cannot delete user with existing documents or comments. Consider deactivating instead.',
      );
    }

    // Delete user and related data without audit logging to avoid circular reference
    await this.prisma.$transaction(async tx => {
      // Delete all audit logs related to this user first
      await tx.$executeRawUnsafe(`DELETE FROM audit_logs WHERE user_id = '${id}'`);
      
      // Delete user without audit context to avoid trigger creating new audit logs
      await tx.$executeRawUnsafe(`DELETE FROM users WHERE id = '${id}'`);
    });

    this.logger.log(`User deleted: ${user.email}`);
  }

  async deactivateUser(id: string): Promise<UserEntity> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.runWithUserContext(
      { userId: id, role: null, departmentId: user.departmentId },
      async tx => {
        return tx.user.update({
          where: { id },
          data: { isActive: false },
          include: { role: true, department: true },
        });
      },
    );

    this.logger.log(`User deactivated: ${user.email}`);
    return updatedUser;
  }

  async activateUser(id: string): Promise<UserEntity> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.runWithUserContext(
      { userId: id, role: null, departmentId: user.departmentId },
      async tx => {
        return tx.user.update({
          where: { id },
          data: { isActive: true },
          include: { role: true, department: true },
        });
      },
    );

    this.logger.log(`User activated: ${user.email}`);
    return updatedUser;
  }

  // ===== HELPER METHODS =====
  async getRoles() {
    return this.prisma.role.findMany({
      where: { isActive: true },
      select: { id: true, name: true, description: true },
    });
  }

  async getDepartments() {
    return this.prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, description: true },
    });
  }
}
