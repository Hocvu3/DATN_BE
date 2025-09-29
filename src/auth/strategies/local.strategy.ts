import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
import { AuthenticatedUser } from '../types';

/**
 * Local authentication strategy for username/password login
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({ usernameField: 'email', passwordField: 'password' });
  }

  /**
   * Validates user credentials and returns authenticated user data
   *
   * @param email User's email
   * @param password User's password
   * @returns Authenticated user data
   * @throws UnauthorizedException with specific message for failed login attempts
   */
  async validate(email: string, password: string): Promise<AuthenticatedUser> {
    try {
      // AuthService.validateUser now throws UnauthorizedException with specific messages
      const user = await this.authService.validateUser(email, password);

      return {
        id: user.id,
        email: user.email,
        role: user.role?.name || 'USER',
      };
    } catch (error) {
      // Let HttpExceptionFilter handle the formatting of the error response
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // For any other error, throw a generic exception
      this.authService['logger'].error('Authentication error:', error);
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
