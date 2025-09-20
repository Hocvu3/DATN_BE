import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { MailerService } from '@nestjs-modules/mailer';
import * as crypto from 'crypto';
import { AuthenticatedUser, JwtPayload } from './types';
import type { UserEntity } from '../users/users.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshSecret: string;
  private readonly refreshExpires: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly prismaService: PrismaService,
  ) {
    this.refreshSecret = process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret';
    this.refreshExpires = process.env.JWT_REFRESH_EXPIRES ?? '7d';
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) return null;
    const ok = await this.usersService.validatePassword(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  private signAccessToken(
    user: Pick<UserEntity, 'id' | 'email'> & { role?: { name?: string } | string | null },
  ): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: typeof user.role === 'string' ? user.role : user.role?.name || 'USER',
    };
    return this.jwtService.sign(payload);
  }

  private signRefreshToken(
    user: Pick<UserEntity, 'id' | 'email'> & { role?: { name?: string } | string | null },
  ): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: typeof user.role === 'string' ? user.role : user.role?.name || 'USER',
    };
    return this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpires,
    });
  }

  async login(user: AuthenticatedUser) {
    const dbUser = await this.usersService.findByEmail(user.email);
    if (!dbUser?.id) throw new UnauthorizedException('Invalid user');
    this.logger.log(`setRefreshToken: userId=${dbUser.id}, typeof=${typeof dbUser.id}`);
    const accessToken = this.signAccessToken(dbUser);
    const refreshToken = this.signRefreshToken(dbUser);
    await this.usersService.setRefreshToken(dbUser.id, refreshToken);

    // create audit log
    await this.prismaService.auditLog.create({
      data: {
        action: 'LOGIN',
        resource: 'User',
        resourceId: dbUser.id,
        userId: dbUser.id,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: { id: dbUser.id, email: dbUser.email, role: dbUser.role?.name || 'USER' },
    };
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.clearRefreshToken(userId);
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException('Invalid refresh token');
    // verify token signature/expiry
    try {
      this.jwtService.verify(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // compare hash
    const storedHash = user.refreshTokenHash;
    const valid = await this.usersService.validatePassword(refreshToken, storedHash);
    if (!valid) throw new UnauthorizedException('Invalid refresh token');
    const accessToken = this.signAccessToken(user);
    const nextRefreshToken = this.signRefreshToken(user);
    await this.usersService.setRefreshToken(user.id, nextRefreshToken);
    return { accessToken, refreshToken: nextRefreshToken };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return; // do not leak existence
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
    await this.usersService.setResetPasswordToken(user.id, token, expires);
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const resetLink = `${appUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    await this.mailer.sendMail({
      to: email,
      subject: 'Reset your password',
      html: `Click the link to reset your password (valid 30 minutes): <a href="${resetLink}">${resetLink}</a>`,
    });
  }

  async resetPassword(email: string, token: string, newPassword: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    const { resetPasswordToken, resetPasswordExpires } = (user ?? {}) as {
      resetPasswordToken: string | null | undefined;
      resetPasswordExpires: Date | null | undefined;
    };
    if (!user || !resetPasswordToken || !resetPasswordExpires)
      throw new BadRequestException('Invalid token');
    if (resetPasswordToken !== token || resetPasswordExpires.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired token');
    }
    await this.usersService.setPassword(user.id, newPassword);
    await this.usersService.clearResetPasswordToken(user.id);
  }
}
