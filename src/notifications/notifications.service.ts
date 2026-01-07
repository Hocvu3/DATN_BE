import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

export interface CreateNotificationDto {
  type: NotificationType;
  title: string;
  message: string;
  recipientId: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateNotificationDto) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          type: data.type,
          title: data.title,
          message: data.message,
          recipientId: data.recipientId,
        },
        include: {
          recipient: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      this.logger.log(`Notification created: ${notification.id}`);
      return notification;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating notification: ${errorMessage}`);
      throw error;
    }
  }

  async createForAdmins(
    type: NotificationType,
    title: string,
    message: string,
  ) {
    try {
      const adminUsers = await this.getAdminUsers();
      
      const notifications = await Promise.all(
        adminUsers.map((admin) =>
          this.create({
            type,
            title,
            message,
            recipientId: admin.id,
          }),
        ),
      );

      this.logger.log(`Created ${notifications.length} notifications for admins`);
      return notifications;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating notifications for admins: ${errorMessage}`);
      throw error;
    }
  }

  async createForAllUsers(
    type: NotificationType,
    title: string,
    message: string,
  ) {
    try {
      const allUsers = await this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      
      const notifications = await Promise.all(
        allUsers.map((user) =>
          this.create({
            type,
            title,
            message,
            recipientId: user.id,
          }),
        ),
      );

      this.logger.log(`Created ${notifications.length} notifications for all users`);
      return notifications;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating notifications for all users: ${errorMessage}`);
      throw error;
    }
  }

  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { recipientId: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({
        where: { recipientId: userId },
      }),
    ]);

    return {
      data: notifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        recipientId: userId,
        isRead: false,
      },
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        recipientId: userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        recipientId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });
  }

  async deleteNotification(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        recipientId: userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  async deleteAllNotifications(userId: string) {
    return this.prisma.notification.deleteMany({
      where: {
        recipientId: userId,
      },
    });
  }

  async getAdminUsers() {
    return this.prisma.user.findMany({
      where: {
        role: {
          name: {
            in: ['admin', 'ADMIN', 'Admin'],
          },
        },
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  /**
   * Create notifications for document creator and their department manager
   * Used for approve/reject notifications
   */
  async createForCreatorAndManager(
    creatorId: string,
    type: NotificationType,
    title: string,
    message: string,
  ) {
    try {
      const recipientIds: string[] = [creatorId];

      // Get creator's department
      const creator = await this.prisma.user.findUnique({
        where: { id: creatorId },
        select: { departmentId: true },
      });

      // If creator has a department, find the department manager
      if (creator?.departmentId) {
        const departmentManager = await this.prisma.user.findFirst({
          where: {
            departmentId: creator.departmentId,
            role: { 
              name: {
                in: ['manager', 'MANAGER', 'Manager'],
              },
            },
            isActive: true,
          },
          select: { id: true },
        });

        if (departmentManager) {
          recipientIds.push(departmentManager.id);
        }
      }

      // Remove duplicates (in case creator is also the manager)
      const uniqueRecipientIds = [...new Set(recipientIds)];

      const notifications = await Promise.all(
        uniqueRecipientIds.map((recipientId) =>
          this.create({
            type,
            title,
            message,
            recipientId,
          }),
        ),
      );

      this.logger.log(`Created ${notifications.length} notifications for creator and manager`);
      return notifications;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating notifications for creator and manager: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Create notifications for admins and department manager of a user
   * Used for login/logout, upload, delete notifications
   * @param userId - ID of the user performing the action
   * @param type - Type of notification
   * @param title - Notification title
   * @param message - Notification message
   */
  async createForAdminsAndUserDepartmentManager(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
  ) {
    try {
      const recipientIds: string[] = [];

      // Get all admin users
      const adminUsers = await this.getAdminUsers();
      recipientIds.push(...adminUsers.map(admin => admin.id));

      // Get user's department manager
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });

      if (user?.departmentId) {
        const departmentManager = await this.prisma.user.findFirst({
          where: {
            departmentId: user.departmentId,
            role: { 
              name: {
                in: ['manager', 'MANAGER', 'Manager'],
              },
            },
            isActive: true,
          },
          select: { id: true },
        });

        if (departmentManager) {
          recipientIds.push(departmentManager.id);
        }
      }

      // Remove duplicates
      const uniqueRecipientIds = [...new Set(recipientIds)];

      const notifications = await Promise.all(
        uniqueRecipientIds.map((recipientId) =>
          this.create({
            type,
            title,
            message,
            recipientId,
          }),
        ),
      );

      this.logger.log(`Created ${notifications.length} notifications for admins and department manager`);
      return notifications;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating notifications for admins and department manager: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Create notifications for admins and manager of a department
   * Used when admin approves/rejects documents
   * @param departmentId - ID of the department
   * @param type - Type of notification
   * @param title - Notification title
   * @param message - Notification message
   */
  async createForAdminsAndDepartmentManager(
    departmentId: string | null,
    type: NotificationType,
    title: string,
    message: string,
  ) {
    try {
      const recipientIds: string[] = [];

      // Get all admin users
      const adminUsers = await this.getAdminUsers();
      recipientIds.push(...adminUsers.map(admin => admin.id));

      // Get department manager if departmentId is provided
      if (departmentId) {
        const departmentManager = await this.prisma.user.findFirst({
          where: {
            departmentId: departmentId,
            role: { 
              name: {
                in: ['manager', 'MANAGER', 'Manager'],
              },
            },
            isActive: true,
          },
          select: { id: true },
        });

        if (departmentManager) {
          recipientIds.push(departmentManager.id);
        }
      }

      // Remove duplicates
      const uniqueRecipientIds = [...new Set(recipientIds)];

      const notifications = await Promise.all(
        uniqueRecipientIds.map((recipientId) =>
          this.create({
            type,
            title,
            message,
            recipientId,
          }),
        ),
      );

      this.logger.log(`Created ${notifications.length} notifications for admins and department manager`);
      return notifications;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating notifications for admins and department manager: ${errorMessage}`);
      throw error;
    }
  }
}
