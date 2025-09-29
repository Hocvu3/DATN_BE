import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { MailerService } from '@nestjs-modules/mailer';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
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

  /**
   * Validates user credentials
   *
   * @param email User email
   * @param password User password
   * @returns User object if valid, throws specific exceptions otherwise
   */
  async validateUser(email: string, password: string) {
    // Check if user exists
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.logger.warn(`Login attempt with non-existent email: ${email}`);
      throw new UnauthorizedException('User not found');
    }

    // Check if user is active
    if (!user.isActive) {
      this.logger.warn(`Login attempt for inactive account: ${email}`);
      throw new UnauthorizedException('Account is inactive');
    }

    // Validate password
    const isPasswordValid = await this.usersService.validatePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`Failed login attempt with incorrect password for: ${email}`);
      throw new UnauthorizedException('Incorrect password');
    }

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

  // ===== INVITATION SYSTEM =====
  async inviteUser(
    inviterId: string,
    data: {
      email: string;
      firstName: string;
      lastName: string;
      username: string;
      roleId: string;
      departmentId?: string;
      message?: string;
    },
  ): Promise<{ invitationToken: string; expiresAt: Date }> {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Check if username is taken
    const existingUsername = await this.prismaService.user.findUnique({
      where: { username: data.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username is already taken');
    }

    // Check if role exists
    const role = await this.prismaService.role.findUnique({
      where: { id: data.roleId },
    });
    if (!role) {
      throw new BadRequestException('Invalid role ID');
    }

    // Check if department exists (if provided)
    if (data.departmentId) {
      const department = await this.prismaService.department.findUnique({
        where: { id: data.departmentId },
      });
      if (!department) {
        throw new BadRequestException('Invalid department ID');
      }
    }

    // Generate invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create user with isActive = false
    await this.prismaService.user.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        passwordHash: '', // Will be set when user registers
        isActive: false, // Default inactive until registration
        roleId: data.roleId,
        departmentId: data.departmentId,
        invitationToken,
        invitationExpires: expiresAt,
        invitedBy: inviterId,
        invitedAt: new Date(),
      },
    });

    this.logger.log(`User invited: ${data.email} by ${inviterId}`);

    // Send invitation email
    await this.sendInvitationEmail(data.email, invitationToken, data.message);

    return { invitationToken, expiresAt };
  }

  async registerFromInvitation(data: {
    email: string;
    invitationToken: string;
    password: string;
    confirmPassword: string;
  }): Promise<UserEntity> {
    // Validate passwords match
    if (data.password !== data.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Find user by email and invitation token
    const user = await this.prismaService.user.findFirst({
      where: {
        email: data.email,
        invitationToken: data.invitationToken,
        invitationExpires: { gt: new Date() }, // Token not expired
        isActive: false, // Not yet activated
      },
      include: { role: true, department: true },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    // Hash password and activate user
    const passwordHash = await bcrypt.hash(data.password, 12);
    const updatedUser = await this.prismaService.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        isActive: true,
        invitationToken: null, // Clear invitation token
        invitationExpires: null,
      },
      include: { role: true, department: true },
    });

    this.logger.log(`User activated from invitation: ${data.email}`);

    return updatedUser;
  }

  async validateInvitationToken(token: string): Promise<{ valid: boolean; user?: UserEntity }> {
    const user = await this.prismaService.user.findFirst({
      where: {
        invitationToken: token,
        invitationExpires: { gt: new Date() },
        isActive: false,
      },
      include: { role: true, department: true },
    });

    return { valid: !!user, user: user || undefined };
  }

  async resendInvitation(
    userId: string,
    inviterId: string,
  ): Promise<{ invitationToken: string; expiresAt: Date }> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isActive) {
      throw new BadRequestException('User is already active');
    }

    // Generate new invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        invitationToken,
        invitationExpires: expiresAt,
        invitedBy: inviterId,
        invitedAt: new Date(),
      },
    });

    this.logger.log(`Invitation resent for user: ${user.email}`);

    // Send invitation email again
    await this.sendInvitationEmail(user.email, invitationToken);

    return { invitationToken, expiresAt };
  }

  async resendInvitationByEmail(
    email: string,
    inviterId: string,
  ): Promise<{ invitationToken: string; expiresAt: Date }> {
    const user = await this.prismaService.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isActive) {
      throw new BadRequestException('User is already active');
    }

    // Generate new invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prismaService.user.update({
      where: { id: user.id },
      data: {
        invitationToken,
        invitationExpires: expiresAt,
        invitedBy: inviterId,
        invitedAt: new Date(),
      },
    });

    this.logger.log(`Invitation resent for user: ${user.email}`);

    // Send invitation email again
    await this.sendInvitationEmail(user.email, invitationToken);

    return { invitationToken, expiresAt };
  }

  // ===== EMAIL METHODS =====
  private async sendInvitationEmail(
    email: string,
    token: string,
    customMessage?: string,
  ): Promise<void> {
    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const registrationUrl = `${appUrl}/register?token=${token}&email=${encodeURIComponent(email)}`;

    const defaultMessage =
      'You have been invited to join our Document Management System. Please click the link below to complete your registration.';
    const message = customMessage || defaultMessage;

    try {
      await this.mailer.sendMail({
        to: email,
        subject: 'Invitation to Document Management System',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Welcome to Document Management System</h2>
            <p>${message}</p>
            <p>Please click the button below to complete your registration:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${registrationUrl}" 
                 style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Complete Registration
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              This invitation will expire in 7 days. If you cannot click the button above, copy and paste this link into your browser:
            </p>
            <p style="color: #666; font-size: 12px; word-break: break-all;">
              ${registrationUrl}
            </p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              If you did not expect this invitation, please ignore this email.
            </p>
          </div>
        `,
      });

      this.logger.log(`Invitation email sent to: ${email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send invitation email to ${email}: ${errorMessage}`);
      throw new BadRequestException('Failed to send invitation email');
    }
  }
}
