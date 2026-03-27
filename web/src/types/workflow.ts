export interface StepType {
  id: string;
  name: string;
  display_name: string;
  category: 'trigger' | 'action' | 'logic' | 'utility';
  description: string;
  icon: string;
  config_schema?: Record<string, any>;
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
  is_active: boolean;
  date_created: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'archived';
  trigger_config?: Record<string, any>;
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
  webhook_slug?: string;
  concurrency: 'allow' | 'skip' | 'queue';
  timeout_seconds?: number;
  date_created: string;
  date_updated?: string;
  edges?: {
    steps?: WorkflowStep[];
    edges?: WorkflowEdge[];
    canvas_notes?: CanvasNote[];
    notification_settings?: NotificationSetting[];
  };
}

export interface NotificationSetting {
  id: string;
  workflow_id: string;
  enabled: boolean;
  channel: 'in_app' | 'email' | 'webhook';
  config?: Record<string, any>;
  notify_on: 'failure' | 'success' | 'all';
  date_created: string;
}

export interface AppNotification {
  id: string;
  workflow_execution_id: string;
  workflow_id: string;
  title: string;
  message?: string;
  status: 'unread' | 'read';
  severity: 'info' | 'success' | 'error';
  date_created: string;
  edges?: {
    workflow?: Workflow;
    workflow_execution?: WorkflowExecution;
  };
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_type_id: string;
  name: string;
  description?: string;
  config?: Record<string, any>;
  position_x: number;
  position_y: number;
  input_mapping?: Record<string, any>;
  timeout_seconds: number;
  retry_count: number;
  retry_backoff: 'none' | 'fixed' | 'exponential';
  retry_delay_ms: number;
  date_created: string;
  edges?: {
    step_type?: StepType;
  };
}

export interface WorkflowEdge {
  id: string;
  workflow_id: string;
  source_step_id: string;
  target_step_id: string;
  source_output?: string;
  target_input?: string;
  edge_type: 'normal' | 'error';
  condition?: Record<string, any>;
  date_created: string;
}

export interface CanvasNote {
  id: string;
  workflow_id: string;
  content?: string;
  color: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  date_created: string;
}

export interface ExpressionVariable {
  path: string;
  description: string;
  type?: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  trigger_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  started_at?: string;
  completed_at?: string;
  date_created: string;
  edges?: {
    step_executions?: StepExecution[];
    workflow?: Workflow;
  };
}

export interface StepExecution {
  id: string;
  workflow_execution_id: string;
  step_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  attempt: number;
  started_at?: string;
  completed_at?: string;
  date_created: string;
  edges?: {
    step?: WorkflowStep;
  };
}

export interface WSEvent {
  type: 'step_status' | 'step_log' | 'execution_status';
  step_id?: string;
  step_name?: string;
  status?: string;
  output?: Record<string, any>;
  error?: string;
  message?: string;
  timestamp: string;
  started_at?: string;
  completed_at?: string;
}

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
}

export interface CanvasSaveRequest {
  steps: Omit<WorkflowStep, 'workflow_id' | 'date_created' | 'edges'>[];
  edges: Omit<WorkflowEdge, 'workflow_id' | 'date_created'>[];
  notes: Omit<CanvasNote, 'workflow_id' | 'date_created'>[];
}
