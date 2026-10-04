import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  checkFieldValue,
  compareRank,
  CUSTOM_FIELD_LIMITS,
  type CustomField,
  type CustomFieldOption,
  type CustomFieldOptionInput,
  type CustomFieldsResponse,
  type CustomFieldValue,
  type Created,
  type CreateCustomFieldRequest,
  ERROR_CODES,
  OPTION_FIELD_TYPES,
  rankForPlacement,
  type UpdateCustomFieldRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from '../spaces/space-errors';
import { asJson, fail } from '../work-items/item-support';

const conflict = (code: Parameters<typeof fail>[0]) => fail(code, HttpStatus.CONFLICT);
const lower = (text: string) => text.toLocaleLowerCase('tr');

interface FieldRow {
  id: string;
  name: string;
  type: CustomField['type'];
  options: unknown;
  rank: string;
}

const toField = (row: FieldRow): CustomField => ({
  id: row.id,
  name: row.name,
  type: row.type,
  options: row.options as CustomFieldOption[],
});

/** Space düzeyinde özel alan tanımları ve iş öğesi değer doğrulaması (Faz 5.4, ADR-082). */
@Injectable()
export class CustomFieldsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get workspaceId() {
    return this.cls.get('workspaceId')!;
  }

  private async rows(spaceId: string): Promise<FieldRow[]> {
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();
    const rows = await this.tenant.db.customField.findMany({ where: { spaceId } });
    return rows.sort(compareRank);
  }

  async list(spaceId: string): Promise<CustomFieldsResponse> {
    return { fields: (await this.rows(spaceId)).map(toField) };
  }

  /** Gelen seçenekleri doğrular; mevcut kimlikler korunur, yenilere kimlik atanır. */
  private normalizeOptions(
    inputs: CustomFieldOptionInput[],
    existing: CustomFieldOption[] = [],
  ): CustomFieldOption[] {
    if (inputs.length === 0) throw fail(ERROR_CODES.CUSTOM_FIELD_OPTIONS_REQUIRED);
    const known = new Set(existing.map((o) => o.id));
    const labels = new Set<string>();
    return inputs.map((input) => {
      const key = lower(input.label);
      if (labels.has(key)) throw fail(ERROR_CODES.CUSTOM_FIELD_OPTIONS_REQUIRED);
      labels.add(key);
      return {
        id: input.id && known.has(input.id) ? input.id : randomUUID(),
        label: input.label,
        color: input.color ?? null,
      };
    });
  }

  async create(spaceId: string, input: CreateCustomFieldRequest): Promise<Created> {
    const rows = await this.rows(spaceId);
    if (rows.length >= CUSTOM_FIELD_LIMITS.fieldsPerSpace) {
      throw conflict(ERROR_CODES.CUSTOM_FIELD_LIMIT);
    }
    if (rows.some((r) => lower(r.name) === lower(input.name))) {
      throw conflict(ERROR_CODES.CUSTOM_FIELD_NAME_TAKEN);
    }
    const hasOptions = OPTION_FIELD_TYPES.includes(input.type);
    const options = hasOptions ? this.normalizeOptions(input.options ?? []) : [];
    const rank = rankForPlacement(rows, null, rows.at(-1)?.id ?? null)!;
    const field = await this.tenant.db.customField.create({
      data: {
        workspaceId: this.workspaceId,
        spaceId,
        name: input.name,
        type: input.type,
        options: asJson(options),
        rank,
      },
      select: { id: true },
    });
    return { id: field.id };
  }

  async update(spaceId: string, fieldId: string, input: UpdateCustomFieldRequest): Promise<void> {
    const rows = await this.rows(spaceId);
    const current = rows.find((r) => r.id === fieldId);
    if (!current) throw notFound();
    if (
      input.name !== undefined &&
      rows.some((r) => r.id !== fieldId && lower(r.name) === lower(input.name!))
    ) {
      throw conflict(ERROR_CODES.CUSTOM_FIELD_NAME_TAKEN);
    }
    let options: CustomFieldOption[] | undefined;
    if (input.options !== undefined) {
      if (!OPTION_FIELD_TYPES.includes(current.type)) {
        throw fail(ERROR_CODES.CUSTOM_FIELD_OPTIONS_REQUIRED);
      }
      options = this.normalizeOptions(input.options, current.options as CustomFieldOption[]);
    }
    await this.tenant.db.customField.update({
      where: { id: fieldId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(options !== undefined && { options: asJson(options) }),
      },
    });
  }

  async move(spaceId: string, fieldId: string, afterId: string | null): Promise<void> {
    const rows = await this.rows(spaceId);
    if (!rows.some((r) => r.id === fieldId)) throw notFound();
    const rank = rankForPlacement(rows, fieldId, afterId);
    if (!rank) throw notFound();
    await this.tenant.db.customField.update({ where: { id: fieldId }, data: { rank } });
  }

  /** Alanı siler; işlerdeki değerler de temizlenir. */
  async remove(spaceId: string, fieldId: string): Promise<void> {
    const rows = await this.rows(spaceId);
    if (!rows.some((r) => r.id === fieldId)) throw notFound();
    const workspaceId = this.workspaceId;
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE work_items SET "customFields" = "customFields" - ${fieldId}
        WHERE "spaceId" = ${spaceId}::uuid AND "workspaceId" = ${workspaceId}::uuid
          AND "customFields" ? ${fieldId}`,
      this.prisma.customField.deleteMany({ where: { id: fieldId, spaceId, workspaceId } }),
    ]);
  }

  /**
   * İş öğesi güncellemesindeki özel alan yamasını doğrular ve normalleştirir
   * (`null` değeri temizler). Tanımsız alan ya da geçersiz değer 422 verir.
   */
  async normalizePatch(
    spaceId: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, CustomFieldValue | null>> {
    const entries = Object.entries(patch);
    if (entries.length === 0) return {};
    const fields = new Map((await this.rows(spaceId)).map((r) => [r.id, r]));
    const result: Record<string, CustomFieldValue | null> = {};
    const people: string[] = [];
    for (const [fieldId, raw] of entries) {
      const row = fields.get(fieldId);
      if (!row) throw fail(ERROR_CODES.CUSTOM_FIELD_VALUE_INVALID);
      const check = checkFieldValue(
        { id: row.id, type: row.type, options: row.options as CustomFieldOption[] },
        raw,
      );
      if (!check.ok) throw fail(ERROR_CODES.CUSTOM_FIELD_VALUE_INVALID);
      result[fieldId] = check.value;
      if (row.type === 'PERSON' && typeof check.value === 'string') people.push(check.value);
    }
    if (people.length > 0) {
      const unique = [...new Set(people)];
      const members = await this.tenant.db.membership.count({ where: { userId: { in: unique } } });
      if (members !== unique.length) throw fail(ERROR_CODES.CUSTOM_FIELD_VALUE_INVALID);
    }
    return result;
  }
}
