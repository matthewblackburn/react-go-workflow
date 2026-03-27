import type { CreateSecretRequest, Secret, UpdateSecretRequest } from '@/types/secret';
import { api } from './client';
import type { PaginatedResponse } from './workflows';

export const secretApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    api.get<PaginatedResponse<Secret>>('/v1/secrets', params),

  get: (id: string) => api.get<Secret>(`/v1/secrets/${id}`),

  create: (data: CreateSecretRequest) => api.post<Secret>('/v1/secrets', data),

  update: (id: string, data: UpdateSecretRequest) => api.patch<Secret>(`/v1/secrets/${id}`, data),

  delete: (id: string) => api.del(`/v1/secrets/${id}`),
};
