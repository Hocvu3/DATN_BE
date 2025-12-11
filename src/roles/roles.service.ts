import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAllRoles() {
    return this.prisma.role.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRoleById(id: string) {
    return this.prisma.role.findUnique({
      where: { id },
    });
  }

  async getRoleByName(name: string) {
    return this.prisma.role.findUnique({
      where: { name },
    });
  }

  async createRole(data: CreateRoleDto) {
    this.logger.log(`Creating role: ${data.name}`);
    return this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateRole(id: string, data: UpdateRoleDto) {
    this.logger.log(`Updating role: ${id}`);
    return this.prisma.role.update({
      where: { id },
      data,
    });
  }

  async deleteRole(id: string) {
    this.logger.log(`Deleting role: ${id}`);
    return this.prisma.role.delete({
      where: { id },
    });
  }

  async getUserCountByRole(roleId: string): Promise<number> {
    return this.prisma.user.count({
      where: { roleId },
    });
  }

  async assignRoleToUser(userId: string, roleId: string) {
    this.logger.log(`Assigning role ${roleId} to user ${userId}`);
    return this.prisma.user.update({
      where: { id: userId },
      data: { roleId },
      include: {
        role: true,
      },
    });
  }

  async getUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        department: true,
      },
    });
  }

  async updateUser(userId: string, data: { roleId: string }) {
    this.logger.log(`Updating user ${userId} with role ${data.roleId}`);
    return this.prisma.user.update({
      where: { id: userId },
      data,
      include: {
        role: true,
      },
    });
  }
}
