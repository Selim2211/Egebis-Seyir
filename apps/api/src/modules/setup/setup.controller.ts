import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ERROR_CODES,
  MeResponseSchema,
  SetupRequestSchema,
  SetupStatusSchema,
  type MeResponse,
  type SetupStatus,
} from '@scrum/shared';
import type { Request, Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { AccessService } from '../access/access.service';
import { AuthRateLimit, Public } from '../auth/decorators';
import { SessionService } from '../auth/session.service';
import { SetupService } from './setup.service';

class SetupDto extends createZodDto(SetupRequestSchema) {}
class SetupStatusDto extends createZodDto(SetupStatusSchema) {}
class MeDto extends createZodDto(MeResponseSchema) {}

@Public()
@Controller('setup')
export class SetupController {
  constructor(
    private readonly setup: SetupService,
    private readonly sessions: SessionService,
    private readonly access: AccessService,
  ) {}

  @Get('status')
  @ZodResponse({ type: SetupStatusDto })
  async status(): Promise<SetupStatus> {
    return { needsSetup: await this.setup.needsSetup() };
  }

  @AuthRateLimit()
  @Post()
  @ZodResponse({ type: MeDto, status: HttpStatus.CREATED })
  async run(
    @Body() body: SetupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    if (!(await this.setup.needsSetup()))
      throw new ConflictException({ code: ERROR_CODES.SETUP_ALREADY_DONE });
    const userId = await this.setup.run(body);
    await this.sessions.start(res, req, userId, true);
    return this.access.me(userId);
  }
}
