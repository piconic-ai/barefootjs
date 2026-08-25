module github.com/piconic-ai/barefootjs/integrations/echo

go 1.25.6

require (
	github.com/barefootjs/runtime/bf v0.0.0
	github.com/labstack/echo/v4 v4.15.3
)

replace github.com/barefootjs/runtime/bf => ../../packages/adapter-go-template/runtime

require (
	github.com/labstack/gommon v0.5.0 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.22 // indirect
	github.com/valyala/bytebufferpool v1.0.0 // indirect
	github.com/valyala/fasttemplate v1.2.2 // indirect
	golang.org/x/crypto v0.52.0 // indirect
	golang.org/x/net v0.55.0 // indirect
	golang.org/x/sys v0.45.0 // indirect
	golang.org/x/text v0.37.0 // indirect
	golang.org/x/time v0.15.0 // indirect
)
