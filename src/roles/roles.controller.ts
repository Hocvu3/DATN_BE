import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@ApiTags('Admin - Role Management')
@Controller('admin/roles')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all roles (Admin only)' })
  @ApiOkResponse({ description: 'Roles retrieved successfully' })
  async getRoles(@Req() req: { user: { userId: string; role: string } }) {
    // Check if user is ADMIN
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can access this endpoint');
    }

    try {
      const roles = await this.rolesService.getAllRoles();
      
      // Get user count for each role
      const rolesWithCounts = await Promise.all(
        roles.map(async (role) => {
          const userCount = await this.rolesService.getUserCountByRole(role.id);
          return {
            ...role,
            userCount,
          };
        })
      );

      return {
        success: true,
        message: 'Roles retrieved successfully',
        data: rolesWithCounts,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve roles';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by ID (Admin only)' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiOkResponse({ description: 'Role retrieved successfully' })
  async getRoleById(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    // Check if user is ADMIN
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can access this endpoint');
    }

    try {
      const role = await this.rolesService.getRoleById(id);
      
      if (!role) {
        throw new NotFoundException(`Role with ID ${id} not found`);
      }

      const userCount = await this.rolesService.getUserCountByRole(id);

      return {
        success: true,
        message: 'Role retrieved successfully',
        data: {
          ...role,
          userCount,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve role';
      throw new BadRequestException(errorMessage);
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create new role (Admin only)' })
  @ApiOkResponse({ description: 'Role created successfully' })
  async createRole(
    @Req() req: { user: { userId: string; role: string } },
    @Body() createRoleDto: CreateRoleDto,
  ) {
    // Check if user is ADMIN
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can create roles');
    }

    try {
      // Check if role name already exists
      const existingRole = await this.rolesService.getRoleByName(createRoleDto.name);
      if (existingRole) {
        throw new ConflictException(`Role with name "${createRoleDto.name}" already exists`);
      }

      const role = await this.rolesService.createRole(createRoleDto);

      return {
        success: true,
        message: 'Role created successfully',
        data: {
          ...role,
          userCount: 0,
        },
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to create role';
      throw new BadRequestException(errorMessage);
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update role (Admin only)' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiOkResponse({ description: 'Role updated successfully' })
  async updateRole(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    // Check if user is ADMIN
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can update roles');
    }

    try {
      // Check if role exists
      const existingRole = await this.rolesService.getRoleById(id);
      if (!existingRole) {
        throw new NotFoundException(`Role with ID ${id} not found`);
      }

      // If updating name, check if new name is already taken
      if (updateRoleDto.name && updateRoleDto.name !== existingRole.name) {
        const roleWithSameName = await this.rolesService.getRoleByName(updateRoleDto.name);
        if (roleWithSameName) {
          throw new ConflictException(`Role with name "${updateRoleDto.name}" already exists`);
        }
      }

      const role = await this.rolesService.updateRole(id, updateRoleDto);
      const userCount = await this.rolesService.getUserCountByRole(id);

      return {
        success: true,
        message: 'Role updated successfully',
        data: {
          ...role,
          userCount,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to update role';
      throw new BadRequestException(errorMessage);
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete role (Admin only)' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiOkResponse({ description: 'Role deleted successfully' })
  async deleteRole(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    // Check if user is ADMIN
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can delete roles');
    }

    try {
      // Check if role exists
      const existingRole = await this.rolesService.getRoleById(id);
      if (!existingRole) {
        throw new NotFoundException(`Role with ID ${id} not found`);
      }

      // Check if role has users
      const userCount = await this.rolesService.getUserCountByRole(id);
      if (userCount > 0) {
        throw new BadRequestException(
          `Cannot delete role "${existingRole.name}" because it is assigned to ${userCount} user(s). Please reassign or remove these users first.`
        );
      }

      await this.rolesService.deleteRole(id);

      return {
        success: true,
        message: 'Role deleted successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete role';
      throw new BadRequestException(errorMessage);
    }
  }

  // User-Role Assignment endpoints
  @Put(':roleId/users/:userId')
  @ApiOperation({ summary: 'Assign role to user (Admin only)' })
  @ApiParam({ name: 'roleId', description: 'Role ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiOkResponse({ description: 'Role assigned to user successfully' })
  async assignRoleToUser(
    @Req() req: { user: { userId: string; role: string } },
    @Param('roleId') roleId: string,
    @Param('userId') userId: string,
  ) {
    // Check if user is ADMIN
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can assign roles');
    }

    try {
      // Check if role exists
      const role = await this.rolesService.getRoleById(roleId);
      if (!role) {
        throw new NotFoundException(`Role with ID ${roleId} not found`);
      }

      // Check if user exists
      const user = await this.rolesService.getUserById(userId);
      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Update user's role
      await this.rolesService.updateUser(userId, { roleId });

      return {
        success: true,
        message: `Role "${role.name}" assigned to user successfully`,
        data: {
          userId,
          roleId,
          roleName: role.name,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to assign role to user';
      throw new BadRequestException(errorMessage);
    }
  }
}
