import type { AppNotification } from '@/types/workflow';
import { api } from './client';
import type { PaginatedResponse } from './workflows';

export const notificationApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    api.get<PaginatedResponse<AppNotification>>('/v1/notifications', params),

  unreadCount: () => api.get<{ count: number }>('/v1/notifications/unread-count'),

  markRead: (id: string) => api.patch<AppNotification>(`/v1/notifications/${id}/read`, {}),

  markAllRead: () => api.post<void>('/v1/notifications/mark-all-read', {}),
};
