import { z } from 'zod';
import { WIDGET_IDS, WIDGET_SIZES } from '../constants/dashboard';

export const DashboardWidgetSchema = z.object({
  id: z.enum(WIDGET_IDS),
  size: z.enum(WIDGET_SIZES),
  visible: z.boolean(),
});

/** GET|PUT /api/workspaces/:wid/spaces/:spaceId/dashboard — kullanıcıya özel düzen (ADR-078). */
export const DashboardSchema = z.object({
  widgets: z.array(DashboardWidgetSchema).max(WIDGET_IDS.length),
});
export type Dashboard = z.infer<typeof DashboardSchema>;
