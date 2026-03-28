import { api } from './client';

export interface User {
  id: string;
  email: string;
  time_joined: number;
}

export const userApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    api.get<{ data: User[]; next_cursor?: string }>('/v1/users', params),
  count: () => api.get<{ count: number }>('/v1/users/count'),
  delete: (id: string) => api.del(`/v1/users/${id}`),
  updatePassword: (id: string, password: string) =>
    api.patch<{ status: string }>(`/v1/users/${id}/password`, { password }),
};
