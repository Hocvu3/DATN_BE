import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from './types';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from 'src/users/users.service';

// Keep DTOs if needed later; suppress unused warning for now
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class LoginDto {
  email!: string;
  password!: string;
}
class RefreshDto {
  userId!: string;
  refreshToken!: string;
}
class ForgotDto {
  email!: string;
}
class ResetDto {
  email!: string;
  token!: string;
  newPassword!: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

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
  @UseGuards(AuthGuard('google'))
  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth2 login' })
  async googleAuth() {}

  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth2 callback' })
  async googleCallback(
    @Req()
    req: {
      user: { id: string; email: string; role?: { name?: string } | string | null };
    },
  ) {
    const dbUser = await this.usersService.findByEmail(req.user.email);

    if (!dbUser) {
      throw new UnauthorizedException('User not found. Please contact administrator.');
    }

    const authUser: AuthenticatedUser = {
      id: dbUser.id,
      email: dbUser.email,
      role: typeof dbUser.role === 'string' ? dbUser.role : dbUser.role?.name || 'USER',
    };
    return this.authService.login(authUser);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout (invalidate refresh token)' })
  async logout(@Req() req: { user: { userId: string } }) {
    await this.authService.logout(req.user.userId);
    return { success: true };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({
    schema: { properties: { userId: { type: 'string' }, refreshToken: { type: 'string' } } },
  })
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.userId, dto.refreshToken);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Send password reset email' })
  @ApiBody({ schema: { properties: { email: { type: 'string', format: 'email' } } } })
  async forgotPassword(@Body() dto: ForgotDto) {
    await this.authService.forgotPassword(dto.email);
    return { success: true };
  }

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
    await this.authService.resetPassword(dto.email, dto.token, dto.newPassword);
    return { success: true };
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
}
