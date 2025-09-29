import {
  Controller,
  Get,
  Put,
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
import { UpdateUserDto } from './dto/update-user.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';

@ApiTags('Manager - Department User Management')
@Controller('manager/users')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
export class ManagerController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get users in my department (Manager only)' })
  @ApiOkResponse({ description: 'Department users retrieved successfully' })
  async getDepartmentUsers(
    @Req() req: { user: { userId: string; role: string; departmentId?: string } },
    @Query() query: GetUsersQueryDto,
  ) {
    // Check if user is MANAGER
    if (req.user.role !== 'MANAGER') {
      throw new UnauthorizedException('Only managers can access this endpoint');
    }

    // Get manager's department
    const manager = await this.usersService.findById(req.user.userId);
    if (!manager?.departmentId) {
      throw new BadRequestException('Manager must be assigned to a department');
    }

    try {
      // Filter by manager's department
      const departmentQuery = {
        ...query,
        department: manager.department?.name, // Filter by department name
      };

      const result = await this.usersService.getUsers(departmentQuery);
      return {
        message: 'Department users retrieved successfully',
        department: manager.department?.name,
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

  @Get('department-info')
  @ApiOperation({ summary: 'Get my department information (Manager only)' })
  @ApiOkResponse({ description: 'Department information retrieved successfully' })
  async getDepartmentInfo(@Req() req: { user: { userId: string; role: string } }) {
    if (req.user.role !== 'MANAGER') {
      throw new UnauthorizedException('Only managers can access this endpoint');
    }

    try {
      const manager = await this.usersService.findById(req.user.userId);
      if (!manager?.department) {
        throw new BadRequestException('Manager must be assigned to a department');
      }

      return {
        message: 'Department information retrieved successfully',
        department: manager.department,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID in my department (Manager only)' })
  @ApiOkResponse({ description: 'User retrieved successfully' })
  async getUserById(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    if (req.user.role !== 'MANAGER') {
      throw new UnauthorizedException('Only managers can access this endpoint');
    }

    try {
      const user = await this.usersService.getUserById(id);

      // Check if user is in manager's department
      const manager = await this.usersService.findById(req.user.userId);
      if (user.departmentId !== manager?.departmentId) {
        throw new UnauthorizedException('You can only view users in your department');
      }

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

  @Put(':id')
  @ApiOperation({ summary: 'Update user in my department (Manager only)' })
  @ApiOkResponse({ description: 'User updated successfully' })
  async updateUser(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    if (req.user.role !== 'MANAGER') {
      throw new UnauthorizedException('Only managers can update users');
    }

    try {
      // Check if user is in manager's department
      const user = await this.usersService.getUserById(id);
      const manager = await this.usersService.findById(req.user.userId);

      if (user.departmentId !== manager?.departmentId) {
        throw new UnauthorizedException('You can only update users in your department');
      }

      // Prevent managers from changing role or department
      if (updateUserDto.roleId || updateUserDto.departmentId) {
        throw new BadRequestException('Managers cannot change user roles or departments');
      }

      const updatedUser = await this.usersService.updateUser(id, updateUserDto);
      return {
        message: 'User updated successfully',
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

  @Put(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate user in my department (Manager only)' })
  @ApiOkResponse({ description: 'User deactivated successfully' })
  async deactivateUser(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    if (req.user.role !== 'MANAGER') {
      throw new UnauthorizedException('Only managers can deactivate users');
    }

    // Prevent self-deactivation
    if (req.user.userId === id) {
      throw new BadRequestException('Cannot deactivate your own account');
    }

    try {
      // Check if user is in manager's department
      const user = await this.usersService.getUserById(id);
      const manager = await this.usersService.findById(req.user.userId);

      if (user.departmentId !== manager?.departmentId) {
        throw new UnauthorizedException('You can only deactivate users in your department');
      }

      const deactivatedUser = await this.usersService.deactivateUser(id);
      return {
        message: 'User deactivated successfully',
        user: deactivatedUser,
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
  @ApiOperation({ summary: 'Activate user in my department (Manager only)' })
  @ApiOkResponse({ description: 'User activated successfully' })
  async activateUser(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    if (req.user.role !== 'MANAGER') {
      throw new UnauthorizedException('Only managers can activate users');
    }

    try {
      // Check if user is in manager's department
      const user = await this.usersService.getUserById(id);
      const manager = await this.usersService.findById(req.user.userId);

      if (user.departmentId !== manager?.departmentId) {
        throw new UnauthorizedException('You can only activate users in your department');
      }

      const activatedUser = await this.usersService.activateUser(id);
      return {
        message: 'User activated successfully',
        user: activatedUser,
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
