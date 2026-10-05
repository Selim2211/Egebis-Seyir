import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiTokensResponseSchema,
  CreatedApiTokenSchema,
  CreateApiTokenRequestSchema,
  ERROR_CODES,
  type ApiTokensResponse,
  type CreatedApiToken,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import type { AuthUser } from './auth.constants';
import { ApiTokensService } from './api-tokens.service';
import { CurrentUser } from './decorators';

class TokensDto extends createZodDto(ApiTokensResponseSchema) {}
class CreatedTokenDto extends createZodDto(CreatedApiTokenSchema) {}
class CreateTokenDto extends createZodDto(CreateApiTokenRequestSchema) {}

/** Kişisel API token'ları. Yalnızca oturumla (token ile değil) yönetilir; AuthGuard engeller. */
@Controller('tokens')
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get()
  @ZodResponse({ type: TokensDto })
  list(@CurrentUser() user: AuthUser): Promise<ApiTokensResponse> {
    return this.tokens.list(user.id);
  }

  @Post()
  @ZodResponse({ type: CreatedTokenDto, status: HttpStatus.CREATED })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateTokenDto): Promise<CreatedApiToken> {
    return this.tokens.create(user.id, body);
  }

  @Delete(':tokenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ): Promise<void> {
    if (!(await this.tokens.revoke(user.id, tokenId))) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND });
    }
  }
}
