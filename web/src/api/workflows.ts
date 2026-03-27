import type {
  CanvasSaveRequest,
  CreateWorkflowRequest,
  ExpressionVariable,
  StepType,
  Workflow,
  WorkflowExecution,
} from '@/types/workflow';
import { api } from './client';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export const workflowApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    api.get<PaginatedResponse<Workflow>>('/v1/workflows', params),

  get: (id: string) => api.get<Workflow>(`/v1/workflows/${id}`),

  create: (data: CreateWorkflowRequest) => api.post<Workflow>('/v1/workflows', data),

  update: (id: string, data: Partial<Workflow>) => api.patch<Workflow>(`/v1/workflows/${id}`, data),

  delete: (id: string) => api.del(`/v1/workflows/${id}`),

  saveCanvas: (id: string, data: CanvasSaveRequest) =>
    api.put<Workflow>(`/v1/workflows/${id}/canvas`, data),

  clone: (id: string) => api.post<Workflow>(`/v1/workflows/${id}/clone`, {}),

  expressions: (id: string) =>
    api.get<{ variables: ExpressionVariable[] }>(`/v1/workflows/${id}/expressions`),

  execute: (id: string, input?: Record<string, any>) =>
    api.post<{ execution_id: string; status: string }>(`/v1/workflows/${id}/execute`, { input }),

  listExecutions: (id: string) =>
    api.get<{ data: WorkflowExecution[] }>(`/v1/workflows/${id}/executions`),
};

export const executionApi = {
  list: (params?: Record<string, string | number | undefined>) =>
    api.get<PaginatedResponse<WorkflowExecution>>('/v1/executions', params),

  get: (id: string) => api.get<WorkflowExecution>(`/v1/executions/${id}`),

  cancel: (id: string) =>
    api.post<{ message: string; status: string }>(`/v1/executions/${id}/cancel`, {}),
};

export interface ActiveCron {
  workflow_id: string;
  workflow_name: string;
  expression: string;
  next_run: string;
  prev_run?: string;
}

export const cronApi = {
  list: () => api.get<{ data: ActiveCron[] }>('/v1/crons'),
};

export const databaseApi = {
  listTables: () => api.get<{ data: string[] }>('/v1/database/tables'),
};

export const stepTypeApi = {
  list: () => api.get<{ data: StepType[] }>('/v1/step-types'),

  get: (id: string) => api.get<StepType>(`/v1/step-types/${id}`),
};
