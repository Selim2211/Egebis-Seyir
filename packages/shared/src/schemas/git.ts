import { z } from 'zod';

export const GIT_PROVIDERS = ['GITHUB', 'GITLAB'] as const;
export type GitProvider = (typeof GIT_PROVIDERS)[number];

export const GIT_LINK_KINDS = ['COMMIT', 'PULL_REQUEST'] as const;
export type GitLinkKind = (typeof GIT_LINK_KINDS)[number];

export const GIT_LINK_STATES = ['OPEN', 'MERGED', 'CLOSED'] as const;
export type GitLinkState = (typeof GIT_LINK_STATES)[number];

/** Workspace başına en çok bu kadar Git entegrasyonu. */
export const MAX_GIT_INTEGRATIONS = 10;

/** POST /api/workspaces/:workspaceId/git-integrations */
export const CreateGitIntegrationRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  provider: z.enum(GIT_PROVIDERS),
});
export type CreateGitIntegrationRequest = z.infer<typeof CreateGitIntegrationRequestSchema>;

export const GitIntegrationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  provider: z.enum(GIT_PROVIDERS),
  enabled: z.boolean(),
  lastEventAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type GitIntegration = z.infer<typeof GitIntegrationSchema>;

export const GitIntegrationsResponseSchema = z.object({
  integrations: z.array(GitIntegrationSchema),
  /** Sağlayıcıya yapıştırılacak adresin yolu (`/api` önekiyle, kök adres istemcide eklenir). */
  receiverPath: z.string(),
});
export type GitIntegrationsResponse = z.infer<typeof GitIntegrationsResponseSchema>;

/** Oluşturma yanıtı: gizli anahtar yalnızca burada görünür. */
export const CreatedGitIntegrationSchema = z.object({
  integration: GitIntegrationSchema,
  secret: z.string(),
});
export type CreatedGitIntegration = z.infer<typeof CreatedGitIntegrationSchema>;

export const UpdateGitIntegrationRequestSchema = z.object({ enabled: z.boolean() });
export type UpdateGitIntegrationRequest = z.infer<typeof UpdateGitIntegrationRequestSchema>;

/** İş öğesine bağlı commit / PR. */
export const GitLinkSchema = z.object({
  id: z.uuid(),
  provider: z.enum(GIT_PROVIDERS),
  kind: z.enum(GIT_LINK_KINDS),
  repo: z.string(),
  /** Kısa kimlik: commit için 7 haneli sha, PR için numara. */
  ref: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  state: z.enum(GIT_LINK_STATES).nullable(),
  author: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type GitLink = z.infer<typeof GitLinkSchema>;
