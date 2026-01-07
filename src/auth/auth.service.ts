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
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationType } from '@prisma/client';

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
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
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
    user: Pick<UserEntity, 'id' | 'email' | 'departmentId'> & { role?: { name?: string } | string | null },
  ): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: typeof user.role === 'string' ? user.role : user.role?.name || 'USER',
      departmentId: user.departmentId,
    };
    return this.jwtService.sign(payload);
  }

  private signRefreshToken(
    user: Pick<UserEntity, 'id' | 'email' | 'departmentId'> & { role?: { name?: string } | string | null },
  ): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: typeof user.role === 'string' ? user.role : user.role?.name || 'USER',
      departmentId: user.departmentId,
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

    // Send notification to admins and user's department manager about login
    try {
      const userName = `${dbUser.firstName} ${dbUser.lastName}`;
      const notifications = await this.notificationsService.createForAdminsAndUserDepartmentManager(
        dbUser.id,
        NotificationType.SYSTEM_ALERT,
        'User Logged In',
        `${userName} (${dbUser.email}) has logged into the system.`,
      );
      
      // Send real-time notification via WebSocket
      for (const notification of notifications) {
        await this.notificationsGateway.sendToUser(notification.recipientId, notification);
      }
    } catch (error) {
      this.logger.error(`Failed to send login notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Don't fail login if notification fails
    }

    return {
      accessToken,
      refreshToken,
      user: { 
        id: dbUser.id, 
        email: dbUser.email, 
        role: dbUser.role?.name || 'EMPLOYEE',
        departmentId: dbUser.departmentId 
      },
    };
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.clearRefreshToken(userId);
    
    // Send notification to admins and user's department manager about logout
    try {
      const user = await this.usersService.findById(userId);
      if (user) {
        const userName = `${user.firstName} ${user.lastName}`;
        const notifications = await this.notificationsService.createForAdminsAndUserDepartmentManager(
          userId,
          NotificationType.SYSTEM_ALERT,
          'User Logged Out',
          `${userName} (${user.email}) has logged out of the system.`,
        );
        
        // Send real-time notification via WebSocket
        for (const notification of notifications) {
          await this.notificationsGateway.sendToUser(notification.recipientId, notification);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to send logout notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Don't fail logout if notification fails
    }
  }

  async refresh(refreshToken: string) {
    // Verify and decode the refresh token to get userId
    let decoded: any;
    try {
      decoded = this.jwtService.verify(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const userId = decoded.sub;
    if (!userId) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException('Invalid refresh token');
    
    // Compare hash
    const storedHash = user.refreshTokenHash;
    const valid = await this.usersService.validatePassword(refreshToken, storedHash);
    if (!valid) throw new UnauthorizedException('Invalid refresh token');
    
    const accessToken = this.signAccessToken(user);
    const nextRefreshToken = this.signRefreshToken(user);
    await this.usersService.setRefreshToken(user.id, nextRefreshToken);
    return { accessToken, refreshToken: nextRefreshToken };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('No account found with this email address');
    }
    
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
    await this.usersService.setResetPasswordToken(user.id, token, expires);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    const resetLink = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    
    try {
      await this.mailer.sendMail({
      to: email,
      subject: 'Reset Your Password - DocuFlow',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" width="600" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 8px 8px 0 0;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">DocuFlow</h1>
                      <p style="margin: 10px 0 0; color: #e2e8f0; font-size: 14px;">Document Management System</p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      <h2 style="margin: 0 0 20px; color: #1e293b; font-size: 24px;">Password Reset Request</h2>
                      <p style="margin: 0 0 15px; color: #475569; font-size: 16px; line-height: 1.6;">
                        Hello <strong>${user.firstName} ${user.lastName}</strong>,
                      </p>
                      <p style="margin: 0 0 15px; color: #475569; font-size: 16px; line-height: 1.6;">
                        We received a request to reset the password for your account. Click the button below to create a new password:
                      </p>
                      
                      <!-- Button -->
                      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${resetLink}" style="display: inline-block; padding: 14px 40px; background-color: #f97316; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
                              Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 0 0 15px; color: #475569; font-size: 14px; line-height: 1.6;">
                        Or copy and paste this link into your browser:
                      </p>
                      <p style="margin: 0 0 15px; color: #3b82f6; font-size: 14px; word-break: break-all;">
                        ${resetLink}
                      </p>
                      
                      <!-- Warning Box -->
                      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 25px 0; background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;">
                        <tr>
                          <td>
                            <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                              <strong>⚠️ Important:</strong> This link will expire in 30 minutes for security reasons.
                            </p>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 0 0 15px; color: #475569; font-size: 14px; line-height: 1.6;">
                        If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 30px 40px; background-color: #f8fafc; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
                      <p style="margin: 0 0 10px; color: #64748b; font-size: 13px; line-height: 1.6;">
                        Need help? Contact our support team at <a href="mailto:support@docuflow.com" style="color: #f97316; text-decoration: none;">support@docuflow.com</a>
                      </p>
                      <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                        © ${new Date().getFullYear()} DocuFlow. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      });
    } catch (error) {
      this.logger.error('Failed to send reset password email', error);
      // Still return success to user for security, but log the error
      // In production, you might want to use a proper error monitoring service
      throw new BadRequestException('Failed to send reset email. Please contact support or try again later.');
    }
    
    return { message: 'Password reset instructions have been sent to your email' };
  }

  async resetPassword(email: string, token: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    const { resetPasswordToken, resetPasswordExpires } = (user ?? {}) as {
      resetPasswordToken: string | null | undefined;
      resetPasswordExpires: Date | null | undefined;
    };
    if (!user || !resetPasswordToken || !resetPasswordExpires)
      throw new BadRequestException('Invalid reset token or email');
    if (resetPasswordToken !== token || resetPasswordExpires.getTime() < Date.now()) {
      throw new BadRequestException('Reset token has expired. Please request a new password reset');
    }
    await this.usersService.setPassword(user.id, newPassword);
    await this.usersService.clearResetPasswordToken(user.id);
    
    return { message: 'Password has been reset successfully. You can now login with your new password' };
  }

  // ===== INVITATION SYSTEM =====
  async inviteUser(
    inviterId: string,
    data: {
      email: string;
      firstName: string;
      lastName: string;
      username: string;
      roleId?: string;
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
      data.username += '_' + '_' + Math.random().toString(36).substring(2, 8); // Append random string to username
    }

    // Get roleId and departmentId - use provided or get default first one
    let roleId = data.roleId;
    let departmentId = data.departmentId;

    if (!roleId) {
      const defaultRole = await this.prismaService.role.findFirst();
      roleId = defaultRole?.id || '';
    }

    if (!departmentId) {
      const defaultDepartment = await this.prismaService.department.findFirst();
      departmentId = defaultDepartment?.id || '';
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
        roleId,
        departmentId,
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
    firstName: string;
    lastName: string;
  }): Promise<UserEntity> {
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
        firstName: data.firstName,
        lastName: data.lastName,
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

    const defaultMessage = 'You have been invited to join our Document Management System. Please complete your registration to get started.';
    const message = customMessage || defaultMessage;

    try {
      await this.mailer.sendMail({
        to: email,
        subject: 'Invitation to DocuFlow - Complete Your Registration',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Complete Your Registration</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5; padding: 20px;">
              <tr>
                <td align="center">
                  <table cellpadding="0" cellspacing="0" border="0" width="600" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">DocuFlow</h1>
                        <p style="margin: 10px 0 0; color: #e2e8f0; font-size: 14px;">Document Management System</p>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <h2 style="margin: 0 0 20px; color: #1e293b; font-size: 24px;">Welcome to DocuFlow! 🎉</h2>
                        <p style="margin: 0 0 15px; color: #475569; font-size: 16px; line-height: 1.6;">
                          ${message}
                        </p>
                        
                        <!-- Email Info Box -->
                        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 25px 0; background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px;">
                          <tr>
                            <td>
                              <p style="margin: 0 0 5px; color: #1e40af; font-size: 14px; font-weight: 600;">
                                📧 Your Registration Email
                              </p>
                              <p style="margin: 0; color: #1e40af; font-size: 15px; word-break: break-all;">
                                ${email}
                              </p>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 0 0 15px; color: #475569; font-size: 16px; line-height: 1.6;">
                          Click the button below to complete your registration and set your password:
                        </p>
                        
                        <!-- Button -->
                        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 30px 0;">
                          <tr>
                            <td align="center">
                              <a href="${registrationUrl}" style="display: inline-block; padding: 14px 40px; background-color: #f97316; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
                                Complete Registration
                              </a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 0 0 15px; color: #475569; font-size: 14px; line-height: 1.6;">
                          Or copy and paste this link into your browser:
                        </p>
                        <p style="margin: 0 0 15px; color: #3b82f6; font-size: 14px; word-break: break-all;">
                          ${registrationUrl}
                        </p>
                        
                        <!-- Warning Box -->
                        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 25px 0; background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;">
                          <tr>
                            <td>
                              <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                                <strong>⚠️ Important:</strong> This invitation will expire in 7 days.
                              </p>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 0 0 15px; color: #475569; font-size: 14px; line-height: 1.6;">
                          If you didn't expect this invitation, please ignore this email.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px 40px; background-color: #f8fafc; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0 0 10px; color: #64748b; font-size: 13px; line-height: 1.6;">
                          Need help? Contact our support team at <a href="mailto:support@docuflow.com" style="color: #f97316; text-decoration: none;">support@docuflow.com</a>
                        </p>
                        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                          © ${new Date().getFullYear()} DocuFlow. All rights reserved.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      });

      this.logger.log(`Invitation email sent to: ${email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send invitation email to ${email}: ${errorMessage}`);
      throw new BadRequestException('Failed to send invitation email. Please contact support if the issue persists.');
    }
  }
}
