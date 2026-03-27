package workflow

import (
	"context"
	"log/slog"

	"react-go-workflow/ent"
	entsteptype "react-go-workflow/ent/steptype"
	entworkflow "react-go-workflow/ent/workflow"

	"github.com/google/uuid"
)

// SeedExampleWorkflow creates a "Hello World API" example workflow if no workflows exist yet.
func SeedExampleWorkflow(ctx context.Context, client *ent.Client) error {
	count, err := client.Workflow.Query().Count(ctx)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	// Look up step types we need
	httpType, err := client.StepType.Query().Where(entsteptype.Name("http_request")).Only(ctx)
	if err != nil {
		return err
	}
	logType, err := client.StepType.Query().Where(entsteptype.Name("log")).Only(ctx)
	if err != nil {
		return err
	}
	conditionType, err := client.StepType.Query().Where(entsteptype.Name("condition")).Only(ctx)
	if err != nil {
		return err
	}

	// Create the workflow
	wf, err := client.Workflow.Create().
		SetName("Hello World API").
		SetDescription("Fetches a random fact from a public API, checks if it was successful, and logs the result. A great starting point to learn how workflows work!").
		SetStatus(entworkflow.StatusDraft).
		SetConcurrency(entworkflow.ConcurrencyAllow).
		Save(ctx)
	if err != nil {
		return err
	}

	// Create steps
	fetchStepID := uuid.New()
	checkStepID := uuid.New()
	logSuccessID := uuid.New()
	logFailID := uuid.New()

	_, err = client.Step.Create().
		SetID(fetchStepID).
		SetWorkflowID(wf.ID).
		SetStepTypeID(httpType.ID).
		SetName("Fetch Random Fact").
		SetDescription("Calls a public API to get a random fun fact").
		SetConfig(map[string]any{
			"url":    "https://uselessfacts.jsph.pl/api/v2/facts/random?language=en",
			"method": "GET",
		}).
		SetPositionX(300).
		SetPositionY(50).
		Save(ctx)
	if err != nil {
		return err
	}

	_, err = client.Step.Create().
		SetID(checkStepID).
		SetWorkflowID(wf.ID).
		SetStepTypeID(conditionType.ID).
		SetName("Was it successful?").
		SetDescription("Check if the API returned a 200 status").
		SetConfig(map[string]any{
			"field":    "{{steps.Fetch Random Fact.output.status}}",
			"operator": "equals",
			"value":    "200",
		}).
		SetPositionX(300).
		SetPositionY(200).
		Save(ctx)
	if err != nil {
		return err
	}

	_, err = client.Step.Create().
		SetID(logSuccessID).
		SetWorkflowID(wf.ID).
		SetStepTypeID(logType.ID).
		SetName("Log the fact").
		SetDescription("Logs the random fact we received").
		SetConfig(map[string]any{
			"message": "Here's a fun fact: {{steps.Fetch Random Fact.output.body.text}}",
			"level":   "info",
		}).
		SetPositionX(150).
		SetPositionY(370).
		Save(ctx)
	if err != nil {
		return err
	}

	_, err = client.Step.Create().
		SetID(logFailID).
		SetWorkflowID(wf.ID).
		SetStepTypeID(logType.ID).
		SetName("Log error").
		SetDescription("Logs that something went wrong").
		SetConfig(map[string]any{
			"message": "API request failed with status: {{steps.Fetch Random Fact.output.status}}",
			"level":   "error",
		}).
		SetPositionX(450).
		SetPositionY(370).
		Save(ctx)
	if err != nil {
		return err
	}

	// Create edges
	_, err = client.Edge.Create().
		SetWorkflowID(wf.ID).
		SetSourceStepID(fetchStepID).
		SetTargetStepID(checkStepID).
		Save(ctx)
	if err != nil {
		return err
	}

	_, err = client.Edge.Create().
		SetWorkflowID(wf.ID).
		SetSourceStepID(checkStepID).
		SetTargetStepID(logSuccessID).
		SetSourceOutput("true").
		Save(ctx)
	if err != nil {
		return err
	}

	_, err = client.Edge.Create().
		SetWorkflowID(wf.ID).
		SetSourceStepID(checkStepID).
		SetTargetStepID(logFailID).
		SetSourceOutput("false").
		Save(ctx)
	if err != nil {
		return err
	}

	// Add a helpful sticky note
	_, err = client.CanvasNote.Create().
		SetWorkflowID(wf.ID).
		SetContent("Welcome! This is an example workflow.\n\nIt fetches a random fact from an API, checks if the request succeeded, then logs the result.\n\nClick any step to see its configuration.").
		SetColor("blue").
		SetPositionX(580).
		SetPositionY(80).
		SetWidth(250).
		SetHeight(200).
		Save(ctx)
	if err != nil {
		return err
	}

	slog.Info("seeded example workflow", "name", wf.Name, "id", wf.ID)
	return nil
}
