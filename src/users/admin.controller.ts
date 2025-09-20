import {
  Controller,
  Get,
  Post,
  Put,
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
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';

@ApiTags('Admin - User Management')
@Controller('admin/users')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users with pagination and filters (Admin only)' })
  @ApiOkResponse({ description: 'Users retrieved successfully' })
  async getUsers(
    @Req() req: { user: { userId: string; role: string } },
    @Query() query: GetUsersQueryDto,
  ) {
    // Check if user is ADMIN
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can access this endpoint');
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
  @ApiOperation({ summary: 'Get all available roles (Admin only)' })
  @ApiOkResponse({ description: 'Roles retrieved successfully' })
  async getRoles(@Req() req: { user: { userId: string; role: string } }) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can access this endpoint');
    }

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
  @ApiOperation({ summary: 'Get all available departments (Admin only)' })
  @ApiOkResponse({ description: 'Departments retrieved successfully' })
  async getDepartments(@Req() req: { user: { userId: string; role: string } }) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can access this endpoint');
    }

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
  @ApiOperation({ summary: 'Get user by ID (Admin only)' })
  @ApiOkResponse({ description: 'User retrieved successfully' })
  async getUserById(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can access this endpoint');
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
  @ApiOperation({ summary: 'Update user (Admin only)' })
  @ApiOkResponse({ description: 'User updated successfully' })
  async updateUser(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can update users');
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
  @ApiOperation({ summary: 'Deactivate user (Admin only)' })
  @ApiOkResponse({ description: 'User deactivated successfully' })
  async deactivateUser(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can deactivate users');
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
  @ApiOperation({ summary: 'Activate user (Admin only)' })
  @ApiOkResponse({ description: 'User activated successfully' })
  async activateUser(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can activate users');
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
