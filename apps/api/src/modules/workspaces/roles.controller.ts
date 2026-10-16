import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreatedSchema,
  CreateRoleRequestSchema,
  RolesResponseSchema,
  UpdateRoleRequestSchema,
  WORKSPACE_PERMISSIONS as W,
  type Created,
  type RolesResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission } from '../auth/decorators';
import { RolesService } from './roles.service';

class RolesDto extends createZodDto(RolesResponseSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}
class CreateRoleDto extends createZodDto(CreateRoleRequestSchema) {}
class UpdateRoleDto extends createZodDto(UpdateRoleRequestSchema) {}

/** Roller ve izin matrisi (Ayarlar → Roles, ADR-112). */
@Controller('workspaces/:workspaceId/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission(W.MEMBERS_VIEW)
  @ZodResponse({ type: RolesDto })
  async list(): Promise<RolesResponse> {
    return { roles: await this.roles.list() };
  }

  @Post()
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Body() body: CreateRoleDto): Promise<Created> {
    return this.roles.create(body);
  }

  @Patch(':roleId')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() body: UpdateRoleDto,
  ): Promise<void> {
    await this.roles.update(roleId, body);
  }

  @Post(':roleId/reset')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@Param('roleId', ParseUUIDPipe) roleId: string): Promise<void> {
    await this.roles.reset(roleId);
  }

  @Delete(':roleId')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Query('reassignToRoleId', new ParseUUIDPipe({ optional: true })) reassignToRoleId?: string,
  ): Promise<void> {
    await this.roles.remove(roleId, reassignToRoleId);
  }
}
