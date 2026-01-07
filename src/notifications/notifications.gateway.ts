import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3030',
    credentials: true,
  },
  namespace: '/notifications',
  path: '/api/socket.io/',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private userSocketMap = new Map<string, string>(); // userId -> socketId

  constructor(private readonly notificationsService: NotificationsService) {}

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    
    if (userId) {
      this.userSocketMap.set(userId, client.id);
      this.logger.log(`Client connected: ${client.id}, User: ${userId}`);
      
      // Join user-specific room
      client.join(`user:${userId}`);
      
      // Send unread notifications count
      this.sendUnreadCount(userId);
    } else {
      this.logger.warn(`Client connected without userId: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = Array.from(this.userSocketMap.entries()).find(
      ([_, socketId]) => socketId === client.id,
    )?.[0];

    if (userId) {
      this.userSocketMap.delete(userId);
      this.logger.log(`Client disconnected: ${client.id}, User: ${userId}`);
    }
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: string },
  ) {
    const userId = client.handshake.query.userId as string;
    
    if (!userId) {
      return { success: false, message: 'User not authenticated' };
    }

    try {
      await this.notificationsService.markAsRead(data.notificationId, userId);
      await this.sendUnreadCount(userId);
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error marking notification as read: ${errorMessage}`);
      return { success: false, message: errorMessage };
    }
  }

  @SubscribeMessage('markAllAsRead')
  async handleMarkAllAsRead(@ConnectedSocket() client: Socket) {
    const userId = client.handshake.query.userId as string;
    
    if (!userId) {
      return { success: false, message: 'User not authenticated' };
    }

    try {
      await this.notificationsService.markAllAsRead(userId);
      await this.sendUnreadCount(userId);
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error marking all notifications as read: ${errorMessage}`);
      return { success: false, message: errorMessage };
    }
  }

  @SubscribeMessage('clearAll')
  async handleClearAll(@ConnectedSocket() client: Socket) {
    const userId = client.handshake.query.userId as string;
    
    if (!userId) {
      return { success: false, message: 'User not authenticated' };
    }

    try {
      await this.notificationsService.deleteAllNotifications(userId);
      await this.sendUnreadCount(userId);
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error clearing all notifications: ${errorMessage}`);
      return { success: false, message: errorMessage };
    }
  }

  @SubscribeMessage('getNotifications')
  async handleGetNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { page?: number; limit?: number },
  ) {
    const userId = client.handshake.query.userId as string;
    
    if (!userId) {
      return { success: false, message: 'User not authenticated' };
    }

    try {
      const notifications = await this.notificationsService.getUserNotifications(
        userId,
        data.page || 1,
        data.limit || 20,
      );
      
      return { success: true, data: notifications };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching notifications: ${errorMessage}`);
      return { success: false, message: errorMessage };
    }
  }

  // Send notification to specific user
  async sendToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
    await this.sendUnreadCount(userId);
  }

  // Send notification to all admins
  async sendToAdmins(notification: any) {
    const adminUsers = await this.notificationsService.getAdminUsers();
    
    for (const admin of adminUsers) {
      await this.sendToUser(admin.id, notification);
    }
  }

  // Send unread count to user
  private async sendUnreadCount(userId: string) {
    const count = await this.notificationsService.getUnreadCount(userId);
    this.server.to(`user:${userId}`).emit('unreadCount', count);
  }

  // Broadcast to all connected clients (except sender)
  broadcast(event: string, data: any, exceptSocketId?: string) {
    if (exceptSocketId) {
      this.server.except(exceptSocketId).emit(event, data);
    } else {
      this.server.emit(event, data);
    }
  }
}
