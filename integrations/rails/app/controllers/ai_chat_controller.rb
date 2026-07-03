# frozen_string_literal: true

# Char-by-char SSE stream for the AI chat demo. ActionController::Live runs the
# action in its own thread and flushes each write immediately, so Puma streams
# each character with the 30ms delay visible to the client incrementally — the
# same behavior as the Sinatra example's `stream do |out| ... end`.
class AiChatController < ApplicationController
  include ActionController::Live

  def stream
    response.headers['Content-Type'] = 'text/event-stream'
    response.headers['Cache-Control'] = 'no-cache'
    text = ExampleApp::AI_RESPONSES.sample
    text.each_char do |ch|
      response.stream.write "data: #{JSON.generate(ch)}\n\n"
      sleep 0.03
    end
    response.stream.write "data: [DONE]\n\n"
  ensure
    response.stream.close
  end
end
