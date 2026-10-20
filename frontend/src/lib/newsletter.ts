import { api } from './api';

export type NewsletterBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'button'; text: string; url: string }
  | { type: 'image'; url: string; alt?: string }
  | { type: 'divider' };

export type SubscriberStatus = 'PENDING' | 'ACTIVE' | 'UNSUBSCRIBED';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'PARTIAL' | 'FAILED';

export interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: SubscriberStatus;
  source: string;
  createdAt: string;
}

export interface SubscriberList {
  items: Subscriber[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CampaignSummary {
  id: string;
  subject: string;
  status: CampaignStatus;
  audienceList: boolean;
  audiencePatients: boolean;
  audienceProfessionals: boolean;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  openCount: number;
  clickCount: number;
  scheduledAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Delivery {
  id: string;
  email: string;
  status: 'SENT' | 'FAILED';
  error: string | null;
  sentAt: string;
  openedAt: string | null;
  clickedAt: string | null;
}

export interface TemplateSummary {
  id: string;
  name: string;
  subject: string;
  contentMode: 'BLOCKS' | 'HTML';
  updatedAt: string;
}

export interface TemplateDetail extends TemplateSummary {
  blocks: NewsletterBlock[] | null;
  rawHtml: string | null;
}

export interface CampaignDetail {
  campaign: CampaignSummary & { contentMode: 'BLOCKS' | 'HTML'; blocks: NewsletterBlock[] | null; rawHtml: string | null };
  deliveries: Delivery[];
}

/** Lo que el compositor envía al backend (borrador, vista previa, estimación, envío). */
export interface CampaignContent {
  id?: string;
  subject: string;
  contentMode: 'BLOCKS' | 'HTML';
  blocks?: NewsletterBlock[];
  rawHtml?: string;
  audienceList: boolean;
  audiencePatients: boolean;
  audienceProfessionals: boolean;
  /** ISO 8601; si es futura, el boletín se programa en vez de enviarse ya. */
  scheduledAt?: string;
}

export const newsletterApi = {
  // Suscriptores
  listSubscribers: (params: { status?: string; search?: string; page?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    if (params.page) q.set('page', String(params.page));
    const qs = q.toString();
    return api.get<SubscriberList>(`/newsletter/subscribers${qs ? `?${qs}` : ''}`);
  },
  addSubscriber: (email: string, name?: string) => api.post<Subscriber>('/newsletter/subscribers', { email, name }),
  importSubscribers: (text: string) =>
    api.post<{ received: number; unique: number; added: number; updated: number }>('/newsletter/subscribers/import', { text }),
  removeSubscriber: (id: string) => api.delete(`/newsletter/subscribers/${id}`),

  // Campañas
  listCampaigns: () => api.get<CampaignSummary[]>('/newsletter/campaigns'),
  getCampaign: (id: string) => api.get<CampaignDetail>(`/newsletter/campaigns/${id}`),
  preview: (dto: CampaignContent) => api.post<{ html: string }>('/newsletter/campaigns/preview', dto),
  estimate: (dto: CampaignContent) => api.post<{ total: number }>('/newsletter/campaigns/estimate', dto),
  test: (dto: CampaignContent & { to: string }) => api.post<{ ok: boolean }>('/newsletter/campaigns/test', dto),
  send: (dto: CampaignContent) =>
    api.post<{ ok: boolean; id: string; total?: number; scheduled?: boolean; scheduledAt?: string }>(
      '/newsletter/campaigns/send',
      dto,
    ),
  resendFailed: (id: string) => api.post<{ ok: boolean; retrying: number }>(`/newsletter/campaigns/${id}/resend-failed`),
  cancelSchedule: (id: string) => api.post<{ ok: boolean }>(`/newsletter/campaigns/${id}/cancel`),
  duplicate: (id: string) => api.post<{ id: string }>(`/newsletter/campaigns/${id}/duplicate`),

  // Plantillas
  listTemplates: () => api.get<TemplateSummary[]>('/newsletter/templates'),
  getTemplate: (id: string) => api.get<TemplateDetail>(`/newsletter/templates/${id}`),
  saveTemplate: (dto: CampaignContent & { name: string }) => api.post<TemplateSummary>('/newsletter/templates', dto),
  deleteTemplate: (id: string) => api.delete(`/newsletter/templates/${id}`),
};
