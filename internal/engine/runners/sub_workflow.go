package runners

import (
	"context"
	"fmt"
)

type SubWorkflowRunner struct{}

func (r *SubWorkflowRunner) Run(ctx context.Context, config map[string]any, input map[string]any) (map[string]any, error) {
	workflowID, _ := config["workflow_id"].(string)
	if workflowID == "" {
		return nil, fmt.Errorf("workflow_id is required")
	}

	// TODO: Implement sub-workflow execution by calling Executor.Execute recursively
	// Need to pass the Executor instance to this runner
	return map[string]any{
		"message": fmt.Sprintf("sub-workflow %s would be executed", workflowID),
	}, nil
}
