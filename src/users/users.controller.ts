import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { S3Service } from '../s3/s3.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PresignedUrlDto } from './dto/presigned-url.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly s3Service: S3Service,
  ) {}

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

  // ===== ADMIN USER CRUD =====
  @Get()
  @ApiOperation({ summary: 'Get all users with pagination and filters (Admin/Manager only)' })
  @ApiOkResponse({ description: 'Users retrieved successfully' })
  async getUsers(
    @Req() req: { user: { userId: string; role: string } },
    @Query() query: GetUsersQueryDto,
  ) {
    // Check permissions
    if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
      throw new UnauthorizedException('Insufficient permissions to view users');
    }

    try {
      const result = await this.usersService.getUsers(query);
      return {
        message: 'Users retrieved successfully',
        ...result,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get('roles')
  @ApiOperation({ summary: 'Get all available roles' })
  @ApiOkResponse({ description: 'Roles retrieved successfully' })
  async getRoles() {
    try {
      const roles = await this.usersService.getRoles();
      return { roles };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get('departments')
  @ApiOperation({ summary: 'Get all available departments' })
  @ApiOkResponse({ description: 'Departments retrieved successfully' })
  async getDepartments() {
    try {
      const departments = await this.usersService.getDepartments();
      return { departments };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID (Admin/Manager only)' })
  @ApiOkResponse({ description: 'User retrieved successfully' })
  async getUserById(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    // Check permissions
    if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
      throw new UnauthorizedException('Insufficient permissions to view user details');
    }

    try {
      const user = await this.usersService.getUserById(id);
      return {
        message: 'User retrieved successfully',
        user,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Post('create')
  @ApiOperation({ summary: 'Create new user (Admin only)' })
  @ApiOkResponse({ description: 'User created successfully' })
  async createUser(
    @Req() req: { user: { userId: string; role: string } },
    @Body() createUserDto: CreateUserDto,
  ) {
    // Check permissions - only ADMIN can create users
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can create users');
    }

    try {
      const user = await this.usersService.createUser(createUserDto);
      return {
        message: 'User created successfully',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive,
          role: user.role?.name,
          department: user.department?.name,
        },
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user (Admin/Manager only)' })
  @ApiOkResponse({ description: 'User updated successfully' })
  async updateUser(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    // Check permissions
    if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
      throw new UnauthorizedException('Insufficient permissions to update users');
    }

    try {
      const user = await this.usersService.updateUser(id, updateUserDto);
      return {
        message: 'User updated successfully',
        user,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user (Admin only)' })
  @ApiOkResponse({ description: 'User deleted successfully' })
  async deleteUser(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    // Check permissions - only ADMIN can delete users
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can delete users');
    }

    // Prevent self-deletion
    if (req.user.userId === id) {
      throw new BadRequestException('Cannot delete your own account');
    }

    try {
      await this.usersService.deleteUser(id);
      return {
        message: 'User deleted successfully',
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Put(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate user (Admin/Manager only)' })
  @ApiOkResponse({ description: 'User deactivated successfully' })
  async deactivateUser(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    // Check permissions
    if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
      throw new UnauthorizedException('Insufficient permissions to deactivate users');
    }

    // Prevent self-deactivation
    if (req.user.userId === id) {
      throw new BadRequestException('Cannot deactivate your own account');
    }

    try {
      const user = await this.usersService.deactivateUser(id);
      return {
        message: 'User deactivated successfully',
        user,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Put(':id/activate')
  @ApiOperation({ summary: 'Activate user (Admin/Manager only)' })
  @ApiOkResponse({ description: 'User activated successfully' })
  async activateUser(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    // Check permissions
    if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
      throw new UnauthorizedException('Insufficient permissions to activate users');
    }

    try {
      const user = await this.usersService.activateUser(id);
      return {
        message: 'User activated successfully',
        user,
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
