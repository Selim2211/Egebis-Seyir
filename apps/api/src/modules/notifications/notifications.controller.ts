import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  NotificationPreferencesSchema,
  NotificationsResponseSchema,
  UnreadCountSchema,
  type UnreadCount,
  type NotificationPreferences,
  type NotificationsResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { NotificationsService } from './notifications.service';

class NotificationsDto extends createZodDto(NotificationsResponseSchema) {}
class UnreadCountDto extends createZodDto(UnreadCountSchema) {}
class PreferencesDto extends createZodDto(NotificationPreferencesSchema) {}

const NO_CONTENT = HttpStatus.NO_CONTENT;

/** Kullanıcının kendi bildirim kutusu ve tercihleri; Space izni gerekmez, yalnızca üyelik (ADR-066). */
@Controller('workspaces/:workspaceId/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ZodResponse({ type: NotificationsDto })
  list(
    @Query('unread') unread?: string,
    @Query('before') before?: string,
  ): Promise<NotificationsResponse> {
    const date = before ? new Date(before) : undefined;
    return this.notifications.list({
      unreadOnly: unread === 'true',
      before: date && !Number.isNaN(date.getTime()) ? date : undefined,
    });
  }

  @Get('unread-count')
  @ZodResponse({ type: UnreadCountDto })
  async unreadCount(): Promise<UnreadCount> {
    return { unreadCount: await this.notifications.unreadCount() };
  }

  @Get('preferences')
  @ZodResponse({ type: PreferencesDto })
  preferences(): Promise<NotificationPreferences> {
    return this.notifications.preferences();
  }

  @Put('preferences')
  @HttpCode(NO_CONTENT)
  setPreferences(@Body() body: PreferencesDto): Promise<void> {
    return this.notifications.setPreferences(body);
  }

  @Post('read-all')
  @HttpCode(NO_CONTENT)
  readAll(): Promise<void> {
    return this.notifications.markAllRead();
  }

  @Post(':notificationId/read')
  @HttpCode(NO_CONTENT)
  read(@Param('notificationId', ParseUUIDPipe) id: string): Promise<void> {
    return this.notifications.markRead(id);
  }
}
