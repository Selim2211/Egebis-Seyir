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
  CreatedSchema,
  DashboardSchema,
  FlowSchema,
  FLOW_DEFAULT_DAYS,
  DateOnlySchema,
  ItemTimeSchema,
  LogTimeRequestSchema,
  MyTimerSchema,
  SPACE_PERMISSIONS as S,
  TimesheetSchema,
  WorkloadSchema,
  type Created,
  type Dashboard,
  type Flow,
  type ItemTime,
  type MyTimer,
  type Timesheet,
  type Workload,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { RequireSpacePermission } from '../auth/decorators';
import { DashboardService } from './dashboard.service';
import { FlowService } from './flow.service';
import { TimeService } from './time.service';
import { WorkloadService } from './workload.service';

class ItemTimeDto extends createZodDto(ItemTimeSchema) {}
class LogTimeDto extends createZodDto(LogTimeRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}
class MyTimerDto extends createZodDto(MyTimerSchema) {}
class DashboardDto extends createZodDto(DashboardSchema) {}
class FlowDto extends createZodDto(FlowSchema) {}
class FlowQueryDto extends createZodDto(z.object({ days: z.coerce.number().int().optional() })) {}
class WorkloadDto extends createZodDto(WorkloadSchema) {}
class WorkloadQueryDto extends createZodDto(z.object({ sprintId: z.uuid().optional() })) {}
class TimesheetDto extends createZodDto(TimesheetSchema) {}
class StoppedDto extends createZodDto(z.object({ minutes: z.int() })) {}
class TimesheetQueryDto extends createZodDto(
  z.object({ from: DateOnlySchema.optional(), to: DateOnlySchema.optional() }),
) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);
const NO_CONTENT = HttpStatus.NO_CONTENT;

/** Zaman takibi (Faz 4.3, ADR-075). Sayaç uçları kullanıcının kendi sayacını yönetir. */
@Controller('workspaces/:workspaceId')
export class TimeController {
  constructor(
    private readonly time: TimeService,
    private readonly workload: WorkloadService,
    private readonly flow: FlowService,
    private readonly dashboard: DashboardService,
  ) {}

  @Get('items/:itemId/time')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: ItemTimeDto })
  itemTime(@Uuid('itemId') itemId: string): Promise<ItemTime> {
    return this.time.itemTime(itemId);
  }

  @Post('items/:itemId/time')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  log(@Uuid('itemId') itemId: string, @Body() body: LogTimeDto): Promise<Created> {
    return this.time.log(itemId, body);
  }

  @Delete('items/:itemId/time/:entryId')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  remove(@Uuid('itemId') itemId: string, @Uuid('entryId') entryId: string): Promise<void> {
    return this.time.remove(itemId, entryId);
  }

  @Post('items/:itemId/timer/start')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  start(@Uuid('itemId') itemId: string): Promise<void> {
    return this.time.start(itemId);
  }

  @Get('timer')
  @ZodResponse({ type: MyTimerDto })
  myTimer(): Promise<MyTimer> {
    return this.time.myTimer();
  }

  @Post('timer/stop')
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ type: StoppedDto, status: HttpStatus.OK })
  stop(): Promise<{ minutes: number }> {
    return this.time.stop();
  }

  @Get('spaces/:spaceId/timesheet')
  @RequireSpacePermission(S.REPORT_VIEW)
  @ZodResponse({ type: TimesheetDto })
  timesheet(
    @Uuid('spaceId') spaceId: string,
    @Query() query: TimesheetQueryDto,
  ): Promise<Timesheet> {
    return this.time.timesheet(spaceId, query.from, query.to);
  }

  /** Kişi bazlı iş yükü; sprintId verilirse yalnızca o sprint'in açık işleri (ADR-076). */
  @Get('spaces/:spaceId/workload')
  @RequireSpacePermission(S.REPORT_VIEW)
  @ZodResponse({ type: WorkloadDto })
  workloadOf(
    @Uuid('spaceId') spaceId: string,
    @Query() query: WorkloadQueryDto,
  ): Promise<Workload> {
    return this.workload.workload(spaceId, query.sprintId);
  }

  /** Akış raporları: CFD, throughput, lead/cycle time, bug trendi (ADR-078). */
  @Get('spaces/:spaceId/flow')
  @RequireSpacePermission(S.REPORT_VIEW)
  @ZodResponse({ type: FlowDto })
  flowOf(@Uuid('spaceId') spaceId: string, @Query() query: FlowQueryDto): Promise<Flow> {
    return this.flow.flow(spaceId, query.days ?? FLOW_DEFAULT_DAYS);
  }

  /** Kullanıcının bu Space için pano düzeni (ADR-078). */
  @Get('spaces/:spaceId/dashboard')
  @RequireSpacePermission(S.REPORT_VIEW)
  @ZodResponse({ type: DashboardDto })
  getDashboard(@Uuid('spaceId') spaceId: string): Promise<Dashboard> {
    return this.dashboard.get(spaceId);
  }

  @Put('spaces/:spaceId/dashboard')
  @RequireSpacePermission(S.REPORT_VIEW)
  @ZodResponse({ type: DashboardDto })
  setDashboard(@Uuid('spaceId') spaceId: string, @Body() body: DashboardDto): Promise<Dashboard> {
    return this.dashboard.set(spaceId, body);
  }
}
