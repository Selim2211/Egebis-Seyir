import {
  Body,
  Controller,
  Delete,
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
  BugBoxQuerySchema,
  BugBoxResponseSchema,
  CreatedSchema,
  SaveTicketCompanyRequestSchema,
  SaveTicketRuleRequestSchema,
  TicketCompaniesResponseSchema,
  TicketConnectionTestSchema,
  TicketRulesResponseSchema,
  TicketSettingsSchema,
  UpdateTicketSettingsRequestSchema,
  WORKSPACE_PERMISSIONS as W,
  type BugBoxResponse,
  type Created,
  type TicketCompaniesResponse,
  type TicketConnectionTest,
  type TicketRulesResponse,
  type TicketSettings,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission } from '../auth/decorators';
import { BugBoxService } from './bug-box.service';
import { TicketCompaniesService } from './ticket-companies.service';
import { TicketConfigService } from './ticket-config.service';

class SettingsDto extends createZodDto(TicketSettingsSchema) {}
class UpdateSettingsDto extends createZodDto(UpdateTicketSettingsRequestSchema) {}
class TestDto extends createZodDto(TicketConnectionTestSchema) {}
class CompaniesDto extends createZodDto(TicketCompaniesResponseSchema) {}
class SaveCompanyDto extends createZodDto(SaveTicketCompanyRequestSchema) {}
class RulesDto extends createZodDto(TicketRulesResponseSchema) {}
class SaveRuleDto extends createZodDto(SaveTicketRuleRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}
class BugBoxDto extends createZodDto(BugBoxResponseSchema) {}

const Id = (name: string) => Param(name, ParseUUIDPipe);
const NO_CONTENT = HttpStatus.NO_CONTENT;

/** E-posta ayarları (Ayarlar → E-posta ayarları, ADR-140): posta kutusu, şirket bilgisi, şablonlar, firmalar, kurallar. */
@Controller('workspaces/:workspaceId/tickets')
export class TicketsController {
  constructor(
    private readonly config: TicketConfigService,
    private readonly companies: TicketCompaniesService,
  ) {}

  @Get('settings')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: SettingsDto })
  settings(@Id('workspaceId') workspaceId: string): Promise<TicketSettings> {
    return this.config.view(workspaceId);
  }

  @Put('settings')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(NO_CONTENT)
  saveSettings(
    @Id('workspaceId') workspaceId: string,
    @Body() body: UpdateSettingsDto,
  ): Promise<void> {
    return this.config.update(workspaceId, body);
  }

  @Post('settings/test')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ type: TestDto })
  test(@Id('workspaceId') workspaceId: string): Promise<TicketConnectionTest> {
    return this.config.test(workspaceId);
  }

  @Get('companies')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: CompaniesDto })
  listCompanies(@Id('workspaceId') workspaceId: string): Promise<TicketCompaniesResponse> {
    return this.companies.list(workspaceId);
  }

  @Post('companies')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  createCompany(
    @Id('workspaceId') workspaceId: string,
    @Body() body: SaveCompanyDto,
  ): Promise<Created> {
    return this.companies.create(workspaceId, body);
  }

  @Put('companies/:companyId')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(NO_CONTENT)
  updateCompany(
    @Id('workspaceId') workspaceId: string,
    @Id('companyId') companyId: string,
    @Body() body: SaveCompanyDto,
  ): Promise<void> {
    return this.companies.update(workspaceId, companyId, body);
  }

  @Delete('companies/:companyId')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(NO_CONTENT)
  removeCompany(
    @Id('workspaceId') workspaceId: string,
    @Id('companyId') companyId: string,
  ): Promise<void> {
    return this.companies.remove(workspaceId, companyId);
  }

  @Get('rules')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: RulesDto })
  listRules(@Id('workspaceId') workspaceId: string): Promise<TicketRulesResponse> {
    return this.companies.rules(workspaceId);
  }

  @Post('rules')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  createRule(@Id('workspaceId') workspaceId: string, @Body() body: SaveRuleDto): Promise<Created> {
    return this.companies.createRule(workspaceId, body);
  }

  @Put('rules/:ruleId')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(NO_CONTENT)
  updateRule(
    @Id('workspaceId') workspaceId: string,
    @Id('ruleId') ruleId: string,
    @Body() body: SaveRuleDto,
  ): Promise<void> {
    return this.companies.updateRule(workspaceId, ruleId, body);
  }

  @Delete('rules/:ruleId')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(NO_CONTENT)
  removeRule(@Id('workspaceId') workspaceId: string, @Id('ruleId') ruleId: string): Promise<void> {
    return this.companies.removeRule(workspaceId, ruleId);
  }

  @Post('rules/:ruleId/move/:direction')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(NO_CONTENT)
  moveRule(
    @Id('workspaceId') workspaceId: string,
    @Id('ruleId') ruleId: string,
    @Param('direction') direction: string,
  ): Promise<void> {
    return this.companies.moveRule(workspaceId, ruleId, direction === 'up' ? 'up' : 'down');
  }
}

/** Bug Kutusu: tüm Projelerdeki Bug'lar (ADR-140). Görünürlük Proje erişimine göre süzülür. */
@Controller('workspaces/:workspaceId/bug-box')
export class BugBoxController {
  constructor(private readonly box: BugBoxService) {}

  @Get()
  @ZodResponse({ type: BugBoxDto })
  list(@Query() query: Record<string, string>): Promise<BugBoxResponse> {
    return this.box.list(BugBoxQuerySchema.parse(query));
  }
}
