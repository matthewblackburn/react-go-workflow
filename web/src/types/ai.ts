export interface GenerateWorkflowRequest {
  prompt: string;
  history?: { role: string; content: string }[];
  current_workflow?: {
    steps: { name: string; step_type: string; config: Record<string, unknown> }[];
    edges: { source_step_name: string; target_step_name: string; edge_type: string }[];
  };
}

export interface AskQuestionsResponse {
  type: 'questions';
  questions: string[];
}

export interface GeneratedStep {
  id: string;
  step_type: string;
  step_type_id: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface GeneratedEdge {
  source_step_name: string;
  target_step_name: string;
  source_output?: string;
  edge_type: string;
}

export interface DiagnoseRequest {
  error: string;
  steps: { name: string; step_type: string; config: Record<string, unknown> }[];
  step_results?: Record<string, { status: string; error?: string }>;
}

export interface DiagnoseResponse {
  diagnosis: string;
  suggestion: string;
  is_user_error: boolean;
}

export interface GenerateWorkflowResponse {
  steps: GeneratedStep[];
  edges: GeneratedEdge[];
  summary: string;
  input_schema?: Record<string, unknown>;
  missing_secrets?: string[];
}
