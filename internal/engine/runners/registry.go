package runners

import "react-go-workflow/internal/engine"

// RegisterAll registers all built-in step runners.
func RegisterAll(registry *engine.RunnerRegistry) {
	registry.Register("http_request", &HTTPRequestRunner{})
	registry.Register("transform", &TransformRunner{})
	registry.Register("condition", &ConditionRunner{})
	registry.Register("loop", &LoopRunner{})
	registry.Register("delay", &DelayRunner{})
	registry.Register("log", &LogRunner{})
	registry.Register("set_variable", &SetVariableRunner{})
	registry.Register("send_email", &SendEmailRunner{})
	registry.Register("database_query", &DatabaseQueryRunner{})
	registry.Register("webhook_response", &WebhookResponseRunner{})
	registry.Register("json_parse", &JSONParseRunner{})
	registry.Register("filter", &FilterRunner{})
	registry.Register("sub_workflow", &SubWorkflowRunner{})
}
