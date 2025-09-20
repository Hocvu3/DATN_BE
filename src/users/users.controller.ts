import {
  Controller,
  Get,
  Put,
  Post,
  Body,
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

}
