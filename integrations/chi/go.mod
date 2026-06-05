module github.com/piconic-ai/barefootjs/integrations/chi

go 1.25.6

require (
	github.com/barefootjs/runtime/bf v0.0.0
	github.com/go-chi/chi/v5 v5.1.0
)

replace github.com/barefootjs/runtime/bf => ../../packages/adapter-go-template/runtime
