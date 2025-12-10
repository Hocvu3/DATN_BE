import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from './types';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from 'src/users/users.service';
import { InviteUserDto } from '../users/dto/invite-user.dto';
import { RegisterFromInvitationDto } from '../users/dto/register-from-invitation.dto';
import { ResendInvitationDto } from '../users/dto/resend-invitation.dto';
import { Public } from './decorators/public.decorator';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

// Keep DTOs if needed later
class LoginDto {
  email!: string;
  password!: string;
}
class RefreshDto {
  userId!: string;
  refreshToken!: string;
}
class ForgotDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;
}
class ResetDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;
  
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token!: string;
  
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  newPassword!: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) { }

  @Public()
  @UseGuards(AuthGuard('local'))
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({
    schema: {
      properties: {
        email: { type: 'string', example: 'hocvu2003@gmail.com' },
        password: { type: 'string', example: 'hocvu' },
      },
    },
  })
  @ApiOkResponse({ description: 'JWT tokens returned' })
  async login(@Req() req: { user: AuthenticatedUser }) {
    return this.authService.login(req.user);
  }

  // Google OAuth
  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth2 login' })
  async googleAuth() { }

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth2 callback' })
  async googleCallback(
    @Req()
    req: {
      user: { id: string; email: string; role?: { name?: string } | string | null };
    },
    @Res() res: any,
  ) {
    try {
      const dbUser = await this.usersService.findByEmail(req.user.email);

      if (!dbUser) {
        // Redirect to frontend with error
        const errorMsg = 'User not found. Please contact administrator.';
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
        return res.redirect(`${frontendUrl}/auth/google/callback?error=${encodeURIComponent(errorMsg)}`);
      }

      const authUser: AuthenticatedUser = {
        id: dbUser.id,
        email: dbUser.email,
        role: typeof dbUser.role === 'string' ? dbUser.role : dbUser.role?.name || 'EMPLOYEE',
        departmentId: dbUser.departmentId
      };

      const tokens = await this.authService.login(authUser);

      // Redirect to frontend callback with tokens and user data
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const callbackUrl = `${frontendUrl}/auth/google/callback` +
        `?accessToken=${encodeURIComponent(tokens.accessToken)}` +
        `&refreshToken=${encodeURIComponent(tokens.refreshToken)}` +
        `&user=${encodeURIComponent(JSON.stringify({
          id: authUser.id,
          email: authUser.email,
          name: authUser.email.split('@')[0],
          role: authUser.role
        }))}`;

      return res.redirect(callbackUrl);
    } catch (error: any) {
      // Redirect to frontend with error
      const errorMsg = error?.message || 'Google authentication failed';
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/auth/google/callback?error=${encodeURIComponent(errorMsg)}`);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Public()
  @Post('logout')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout (invalidate refresh token)' })
  async logout(@Req() req: { user: { userId: string } }) {
    await this.authService.logout(req.user.userId);
    return { success: true };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({
    schema: { properties: { userId: { type: 'string' }, refreshToken: { type: 'string' } } },
  })
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.userId, dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Send password reset email' })
  @ApiBody({ schema: { properties: { email: { type: 'string', format: 'email' } } } })
  async forgotPassword(@Body() dto: ForgotDto) {
    const result = await this.authService.forgotPassword(dto.email);
    return { success: true, message: result.message };
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using token' })
  @ApiBody({
    schema: {
      properties: {
        email: { type: 'string' },
        token: { type: 'string' },
        newPassword: { type: 'string' },
      },
    },
  })
  async resetPassword(@Body() dto: ResetDto) {
    const result = await this.authService.resetPassword(dto.email, dto.token, dto.newPassword);
    return { success: true, message: result.message };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current user with full details and relations' })
  async me(@Req() req: { user: { userId: string; email: string; role: string } }) {
    const user = await this.usersService.findById(req.user.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  // ===== INVITATION SYSTEM =====
  @UseGuards(AuthGuard('jwt'))
  @Post('invite')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Invite a new user (Admin/Manager only)' })
  @ApiOkResponse({ description: 'User invitation sent successfully' })
  async inviteUser(
    @Req() req: { user: { userId: string; role: string } },
    @Body() inviteUserDto: InviteUserDto,
  ) {
    // Check if user has permission to invite (Admin or Manager)
    // if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
    //   throw new UnauthorizedException('Insufficient permissions to invite users');
    // }

    try {
      const result = await this.authService.inviteUser(req.user.userId, inviteUserDto);
      return {
        message: 'User invitation sent successfully via email',
        email: inviteUserDto.email,
        expiresAt: result.expiresAt,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Public()
  @Post('complete-registration')
  @ApiOperation({ summary: 'Complete registration from invitation token' })
  @ApiOkResponse({ description: 'Registration completed successfully' })
  async registerFromInvitation(@Body() registerDto: RegisterFromInvitationDto) {
    try {
      const user = await this.authService.registerFromInvitation(registerDto);
      return {
        message: 'Registration completed successfully! You can now login with your credentials.',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
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

  @Get('validate-invitation/:token')
  @ApiOperation({ summary: 'Validate invitation token' })
  @ApiOkResponse({ description: 'Invitation token validation result' })
  async validateInvitationToken(@Req() req: { params: { token: string } }) {
    try {
      const result = await this.authService.validateInvitationToken(req.params.token);
      return {
        valid: result.valid,
        user: result.user
          ? {
            email: result.user.email,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            username: result.user.username,
            role: result.user.role?.name,
            department: result.user.department?.name,
          }
          : null,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('resend-invitation')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Resend invitation to user by email (Admin/Manager only)' })
  @ApiBody({ type: ResendInvitationDto })
  @ApiOkResponse({
    description: 'Invitation resent successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Invitation resent successfully via email' },
        email: { type: 'string', example: 'john.doe@company.com' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async resendInvitation(
    @Req() req: { user: { userId: string; role: string } },
    @Body() resendInvitationDto: ResendInvitationDto,
  ) {
    // Check if user has permission to resend invitations
    if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
      throw new UnauthorizedException('Insufficient permissions to resend invitations');
    }

    try {
      const result = await this.authService.resendInvitationByEmail(
        resendInvitationDto.email,
        req.user.userId,
      );
      return {
        message: 'Invitation resent successfully via email',
        email: resendInvitationDto.email,
        expiresAt: result.expiresAt,
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
