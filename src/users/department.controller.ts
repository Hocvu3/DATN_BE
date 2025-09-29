import {
  Controller,
  Get,
  UseGuards,
  Req,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('Department - Department Information')
@Controller('department')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
export class DepartmentController {
  constructor(private readonly usersService: UsersService) {}

  @Get('info')
  @ApiOperation({ summary: 'Get my department information' })
  @ApiOkResponse({ description: 'Department information retrieved successfully' })
  async getDepartmentInfo(@Req() req: { user: { userId: string; role: string } }) {
    try {
      const user = await this.usersService.findById(req.user.userId);
      if (!user?.department) {
        throw new BadRequestException('User must be assigned to a department');
      }

      return {
        message: 'Department information retrieved successfully',
        department: user.department,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get('colleagues')
  @ApiOperation({ summary: 'Get colleagues in my department' })
  @ApiOkResponse({ description: 'Colleagues retrieved successfully' })
  async getColleagues(@Req() req: { user: { userId: string; role: string } }) {
    try {
      const user = await this.usersService.findById(req.user.userId);
      if (!user?.departmentId) {
        throw new BadRequestException('User must be assigned to a department');
      }

      // Get all users in the same department
      const result = await this.usersService.getUsers({
        department: user.department?.name,
        isActive: true, // Only active users
      });

      // Filter out the current user
      const colleagues = result.users.filter(colleague => colleague.id !== user.id);

      return {
        message: 'Colleagues retrieved successfully',
        department: user.department?.name,
        colleagues,
        total: colleagues.length,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get department statistics' })
  @ApiOkResponse({ description: 'Department statistics retrieved successfully' })
  async getDepartmentStats(@Req() req: { user: { userId: string; role: string } }) {
    try {
      const user = await this.usersService.findById(req.user.userId);
      if (!user?.departmentId) {
        throw new BadRequestException('User must be assigned to a department');
      }

      // Get department statistics
      const [activeUsers, inactiveUsers] = await Promise.all([
        this.usersService.getUsers({
          department: user.department?.name,
          isActive: true,
        }),
        this.usersService.getUsers({
          department: user.department?.name,
          isActive: false,
        }),
      ]);

      // Get role distribution
      const roleStats = activeUsers.users.reduce(
        (acc, colleague) => {
          const roleName = colleague.role?.name || 'Unknown';
          acc[roleName] = (acc[roleName] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      return {
        message: 'Department statistics retrieved successfully',
        department: user.department?.name,
        stats: {
          totalUsers: activeUsers.total + inactiveUsers.total,
          activeUsers: activeUsers.total,
          inactiveUsers: inactiveUsers.total,
          roleDistribution: roleStats,
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
}
