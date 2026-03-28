import type {
  AskQuestionsResponse,
  DiagnoseRequest,
  DiagnoseResponse,
  GenerateWorkflowRequest,
  GenerateWorkflowResponse,
} from '@/types/ai';
import { api } from './client';

export const aiApi = {
  generateWorkflow: (data: GenerateWorkflowRequest) =>
    api.post<GenerateWorkflowResponse | AskQuestionsResponse>(
      '/v1/ai/generate-workflow',
      data,
    ),
  diagnoseExecution: (data: DiagnoseRequest) =>
    api.post<DiagnoseResponse>('/v1/ai/diagnose-execution', data),
};
