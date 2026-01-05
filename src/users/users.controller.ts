import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { S3Service } from '../s3/s3.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PresignedUrlDto } from './dto/presigned-url.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly s3Service: S3Service,
  ) { }

  @Get()
  @ApiOperation({ summary: 'Get users with pagination (RLS restricted)' })
  @ApiOkResponse({ description: 'Users retrieved successfully' })
  async getUsers(
    @Req() req: { user: { userId: string } },
    @Query() query: GetUsersQueryDto,
  ) {
    const userId = req.user.userId;
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    // RLS: Employees are restricted to their department or self
    if (user.role?.name === 'EMPLOYEE') {
      if (user.departmentId) {
        query.departmentId = user.departmentId;
      } else {
        // If no department, return only self
        if (query.username !== user.username) {
          query.username = user.username;
        }
      }
    }
    // Managers and Admins can view users based on query filters
    // If departmentId is provided in query, filter by that department
    // Otherwise, return all users (useful for adding members from any department)

    return this.usersService.getUsers(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create user (RLS restricted)' })
  @ApiOkResponse({ description: 'User created successfully' })
  async createUser(
    @Req() req: { user: { userId: string } },
    @Body() createUserDto: CreateUserDto,
  ) {
    const userResult = await this.usersService.findById(req.user.userId);
    if (!userResult) throw new UnauthorizedException('User not found');

    // RLS: Manager restriction
    if (userResult.role?.name === 'MANAGER') {
      const deptId = userResult.departmentId;
      if (!deptId) throw new ForbiddenException('Manager has no department to add users to');

      // Enforce department
      if (createUserDto.departmentId && createUserDto.departmentId !== deptId) {
        throw new ForbiddenException('Cannot add user to another department');
      }
      createUserDto.departmentId = deptId;

      // Managers should only create Employees. Look up Role ID for 'EMPLOYEE'
      // Note: This requires getting all roles and finding the one named 'EMPLOYEE' (or 'employee')
      // Since we don't have direct access to Prisma here, we rely on `getRoles` from service.
      const roles = await this.usersService.getRoles();
      const employeeRole = roles.find(r => r.name === 'EMPLOYEE' || r.name === 'employee'); // handle casing
      if (!employeeRole) {
        // Fallback or error?
        throw new BadRequestException('EMPLOYEE role not found in system');
      }
      createUserDto.roleId = employeeRole.id;

    } else if (userResult.role?.name !== 'ADMIN') {
      throw new ForbiddenException('Only Admin or Manager can create users');
    } else {
      // Admin must provide roleId
      if (!createUserDto.roleId) {
        throw new BadRequestException('roleId is required for Admin');
      }
    }

    return this.usersService.createUser(createUserDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user (RLS restricted)' })
  @ApiOkResponse({ description: 'User deleted successfully' })
  async deleteUser(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    const currentUser = await this.usersService.findById(req.user.userId);
    if (!currentUser) throw new UnauthorizedException('User not found');

    if (currentUser.role?.name === 'MANAGER') {
      if (id === currentUser.id) throw new BadRequestException('Cannot delete your own account');

      const targetUser = await this.usersService.findById(id);
      if (!targetUser) throw new NotFoundException('User not found');

      if (targetUser.departmentId !== currentUser.departmentId) {
        throw new ForbiddenException('Cannot delete user from another department');
      }
    } else if (currentUser.role?.name !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }

    return this.usersService.deleteUser(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user (RLS restricted)' })
  @ApiOkResponse({ description: 'User updated successfully' })
  async updateUser(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: { departmentId?: string; roleId?: string; isActive?: boolean },
  ) {
    const currentUser = await this.usersService.findById(req.user.userId);
    if (!currentUser) throw new UnauthorizedException('User not found');

    const targetUser = await this.usersService.findById(id);
    if (!targetUser) throw new NotFoundException('Target user not found');

    // RLS: Manager logic
    if (currentUser.role?.name === 'MANAGER') {
      const deptId = currentUser.departmentId;
      if (!deptId) throw new ForbiddenException('Manager has no department');

      // Manager can ONLY assign user to THEIR department
      if (body.departmentId && body.departmentId !== deptId) {
        throw new ForbiddenException('Cannot assign user to another department');
      }

      // If assigning to department, target user must not belong to another department (unless it's the same)
      if (body.departmentId) {
        if (targetUser.departmentId && targetUser.departmentId !== deptId) {
          throw new ForbiddenException('User already belongs to another department');
        }
      }

      // Manager can create/assign Employee role
      // Fix: If assigning department, also ensure Role is EMPLOYEE if not already?
      // For now, allow manager to just set department.
    } else if (currentUser.role?.name !== 'ADMIN') {
      // Allow user to update their own profile? No, use profile endpoint.
      throw new ForbiddenException('Insufficient permissions');
    }

    return this.usersService.updateUser(id, body);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ description: 'User profile retrieved successfully' })
  async getProfile(@Req() req: { user: { userId: string } }) {
    const user = await this.usersService.findById(req.user.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  @Put('change-password')
  @ApiOperation({ summary: 'Change user password' })
  @ApiOkResponse({ description: 'Password changed successfully' })
  async changePassword(
    @Req() req: { user: { userId: string } },
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    try {
      await this.usersService.changePassword(
        req.user.userId,
        changePasswordDto.currentPassword,
        changePasswordDto.newPassword,
      );
      return { message: 'Password changed successfully' };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiOkResponse({ description: 'Profile updated successfully' })
  async updateProfile(
    @Req() req: { user: { userId: string } },
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    try {
      const updatedUser = await this.usersService.updateProfile(req.user.userId, updateProfileDto);
      return {
        message: 'Profile updated successfully',
        user: updatedUser,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Post('avatar/presigned-url')
  @ApiOperation({ summary: 'Generate presigned URL for avatar upload' })
  @ApiOkResponse({ description: 'Presigned URL generated successfully' })
  async generateAvatarPresignedUrl(
    @Req() req: { user: { userId: string } },
    @Body() presignedUrlDto: PresignedUrlDto,
  ) {
    try {
      const { presignedUrl, key, publicUrl } = await this.s3Service.generateAvatarPresignedUrl(
        presignedUrlDto.fileName,
        presignedUrlDto.contentType,
      );

      // Create asset record in database
      const asset = await this.usersService.createAsset({
        filename: presignedUrlDto.fileName,
        s3Url: publicUrl,
        contentType: presignedUrlDto.contentType,
        sizeBytes: presignedUrlDto.fileSize ?? undefined,
        uploadedById: req.user.userId,
      });

      return {
        presignedUrl,
        key,
        publicUrl,
        assetId: asset.id,
        message: 'Upload file to presigned URL, then call PUT /users/avatar to set as avatar',
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Put('avatar')
  @ApiOperation({ summary: 'Set user avatar' })
  @ApiOkResponse({ description: 'Avatar updated successfully' })
  async updateAvatar(@Req() req: { user: { userId: string } }, @Body() body: { assetId: string }) {
    try {
      const updatedUser = await this.usersService.updateAvatar(req.user.userId, body.assetId);
      return {
        message: 'Avatar updated successfully',
        user: updatedUser,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Put('avatar/remove')
  @ApiOperation({ summary: 'Remove user avatar' })
  @ApiOkResponse({ description: 'Avatar removed successfully' })
  async removeAvatar(@Req() req: { user: { userId: string } }) {
    try {
      const updatedUser = await this.usersService.removeAvatar(req.user.userId);
      return {
        message: 'Avatar removed successfully',
        user: updatedUser,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }
}
