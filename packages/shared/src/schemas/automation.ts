import { z } from 'zod';
import { PRIORITIES, WORK_ITEM_TYPES } from '../constants/work-item';
import { CustomFieldValueSchema } from './custom-field';

/** Space başına en çok bu kadar otomasyon (ADR-084). */
export const MAX_AUTOMATIONS_PER_SPACE = 30;
export const MAX_AUTOMATION_ACTIONS = 5;

export const AutomationTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ITEM_CREATED') }),
  z.object({ type: z.literal('STATUS_CHANGED'), toStatusId: z.uuid().nullable() }),
  z.object({ type: z.literal('PRIORITY_CHANGED'), to: z.enum(PRIORITIES).nullable() }),
]);

export const AutomationConditionsSchema = z.object({
  types: z.array(z.enum(WORK_ITEM_TYPES)).max(5).optional(),
  priorities: z.array(z.enum(PRIORITIES)).max(4).optional(),
  labelIds: z.array(z.uuid()).max(20).optional(),
  unassigned: z.boolean().optional(),
});

export const AUTOMATION_ACTION_TYPES = [
  'ASSIGN',
  'NOTIFY',
  'SET_PRIORITY',
  'SET_STATUS',
  'SET_CUSTOM_FIELD',
  'CREATE_SUBTASK',
] as const;

export const AutomationActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ASSIGN'), userId: z.uuid() }),
  z.object({
    type: z.literal('NOTIFY'),
    to: z.enum(['ASSIGNEES', 'REPORTER', 'USER']),
    userId: z.uuid().optional(),
    message: z.string().trim().min(1).max(200),
  }),
  z.object({ type: z.literal('SET_PRIORITY'), priority: z.enum(PRIORITIES) }),
  z.object({ type: z.literal('SET_STATUS'), statusId: z.uuid() }),
  z.object({
    type: z.literal('SET_CUSTOM_FIELD'),
    fieldId: z.uuid(),
    value: CustomFieldValueSchema.nullable(),
  }),
  z.object({ type: z.literal('CREATE_SUBTASK'), title: z.string().trim().min(1).max(200) }),
]);

const Name = z.string().trim().min(1).max(80);

/** POST .../spaces/:spaceId/automations */
export const CreateAutomationRequestSchema = z.object({
  name: Name,
  enabled: z.boolean().default(true),
  trigger: AutomationTriggerSchema,
  conditions: AutomationConditionsSchema.default({}),
  actions: z.array(AutomationActionSchema).min(1).max(MAX_AUTOMATION_ACTIONS),
});
export type CreateAutomationRequest = z.input<typeof CreateAutomationRequestSchema>;
export type CreateAutomationData = z.output<typeof CreateAutomationRequestSchema>;

/** PATCH .../automations/:automationId */
export const UpdateAutomationRequestSchema = z
  .object({
    name: Name,
    enabled: z.boolean(),
    trigger: AutomationTriggerSchema,
    conditions: AutomationConditionsSchema,
    actions: z.array(AutomationActionSchema).min(1).max(MAX_AUTOMATION_ACTIONS),
  })
  .partial();
export type UpdateAutomationRequest = z.infer<typeof UpdateAutomationRequestSchema>;

export const AutomationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  enabled: z.boolean(),
  trigger: AutomationTriggerSchema,
  conditions: AutomationConditionsSchema,
  actions: z.array(AutomationActionSchema),
  createdAt: z.iso.datetime(),
});
export type Automation = z.infer<typeof AutomationSchema>;

export const AutomationsResponseSchema = z.object({ automations: z.array(AutomationSchema) });
export type AutomationsResponse = z.infer<typeof AutomationsResponseSchema>;

export const AutomationRunSchema = z.object({
  id: z.uuid(),
  itemKey: z.string().nullable(),
  outcome: z.enum(['OK', 'SKIPPED', 'FAILED']),
  message: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AutomationRun = z.infer<typeof AutomationRunSchema>;

export const AutomationRunsResponseSchema = z.object({ runs: z.array(AutomationRunSchema) });
export type AutomationRunsResponse = z.infer<typeof AutomationRunsResponseSchema>;
