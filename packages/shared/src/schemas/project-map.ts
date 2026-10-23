import { z } from 'zod';
import { STATUS_CATEGORIES } from '../constants/work-item';
import { WorkItemTypeSchema } from './work-item';

/** Proje Kuş Bakışı'ndaki bir kutu: Epic, Task, Sub-Task ya da Bug (ADR-136). */
export const MapNodeSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  type: WorkItemTypeSchema,
  title: z.string(),
  parentId: z.uuid().nullable(),
  color: z.string().nullable(),
  status: z.object({ name: z.string(), color: z.string(), category: z.enum(STATUS_CATEGORIES) }),
  assignees: z.array(
    z.object({ id: z.uuid(), name: z.string(), avatarVersion: z.string().nullable() }),
  ),
  sprint: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});
export type MapNode = z.infer<typeof MapNodeSchema>;

export const MAX_MAP_POSITIONS = 5000;

export const MapPositionsSchema = z
  .record(
    z.uuid(),
    z.object({ x: z.number().min(-1e6).max(1e6), y: z.number().min(-1e6).max(1e6) }),
  )
  .refine((p) => Object.keys(p).length <= MAX_MAP_POSITIONS);

/** GET .../spaces/:spaceId/map — işler ve kullanıcının kaydettiği kutu konumları. */
export const ProjectMapSchema = z.object({
  nodes: z.array(MapNodeSchema),
  positions: MapPositionsSchema,
});
export type ProjectMap = z.infer<typeof ProjectMapSchema>;

/** PUT .../spaces/:spaceId/map/layout — kullanıcıya özel kutu konumları (boş = otomatik düzene dön). */
export const MapLayoutRequestSchema = z.object({ positions: MapPositionsSchema });
export type MapLayoutRequest = z.infer<typeof MapLayoutRequestSchema>;
