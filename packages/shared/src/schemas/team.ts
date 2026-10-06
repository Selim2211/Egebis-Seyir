import { z } from 'zod';

export const MAX_TEAMS_PER_WORKSPACE = 100;
export const MAX_TEAM_MEMBERS = 200;

const Name = z.string().trim().min(1).max(60);
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const MemberIds = z.array(z.uuid()).max(MAX_TEAM_MEMBERS);

/** POST /api/workspaces/:wid/teams */
export const CreateTeamRequestSchema = z.object({
  name: Name,
  color: Color.default('#2563EB'),
  memberIds: MemberIds.default([]),
});
export type CreateTeamRequest = z.input<typeof CreateTeamRequestSchema>;

export const UpdateTeamRequestSchema = z
  .object({ name: Name, color: Color, memberIds: MemberIds })
  .partial();
export type UpdateTeamRequest = z.infer<typeof UpdateTeamRequestSchema>;

export const TeamSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  members: z.array(
    z.object({ id: z.uuid(), name: z.string(), avatarVersion: z.string().nullable() }),
  ),
});
export type Team = z.infer<typeof TeamSchema>;

export const TeamsResponseSchema = z.object({ teams: z.array(TeamSchema) });
export type TeamsResponse = z.infer<typeof TeamsResponseSchema>;
