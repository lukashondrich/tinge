export class FunctionCallService {
  constructor({
    getUserProfile,
    updateUserProfile,
    searchKnowledge,
    onEvent,
    sendJson,
    makeEventId = () => crypto.randomUUID(),
    error = () => {}
  }) {
    this.getUserProfile = getUserProfile;
    this.updateUserProfile = updateUserProfile;
    this.searchKnowledge = searchKnowledge;
    this.onEvent = onEvent;
    this.sendJson = sendJson;
    this.makeEventId = makeEventId;
    this.error = error;
  }

  parseArgs(raw) {
    return JSON.parse(raw || '{}');
  }

  emitSearchStarted(args) {
    this.onEvent?.({
      type: 'tool.search_knowledge.started',
      args
    });
  }

  emitSearchResult({ data, telemetry, args }) {
    this.onEvent?.({
      type: 'tool.search_knowledge.result',
      result: data,
      telemetry,
      args
    });
  }

  emitSearchError({ errorMessage, args }) {
    this.onEvent?.({
      type: 'tool.search_knowledge.result',
      result: { results: [], error: errorMessage },
      telemetry: {
        queryOriginal: args.query_original || '',
        queryEn: args.query_en || '',
        language: args.language || '',
        topK: args.top_k || '',
        durationMs: 0,
        resultCount: 0,
        status: 'error',
        error: errorMessage
      },
      args
    });
  }

  async dispatchFunctionCall(event, args) {
    if (event.name === 'get_user_profile') {
      return this.getUserProfile(args);
    }
    if (event.name === 'update_user_profile') {
      return this.updateUserProfile(args);
    }
    if (event.name === 'search_knowledge') {
      this.emitSearchStarted(args);
      const searchPayload = await this.searchKnowledge(args);
      this.emitSearchResult({
        data: searchPayload.data,
        telemetry: searchPayload.telemetry,
        args
      });
      return searchPayload.data;
    }

    this.error(`Unknown function call: ${event.name}`);
    return { error: `Unknown function: ${event.name}` };
  }

  sendFunctionOutput(callId, output) {
    this.sendJson({
      type: 'conversation.item.create',
      event_id: this.makeEventId(),
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(output)
      }
    });

    this.sendJson({
      type: 'response.create',
      event_id: this.makeEventId()
    });
  }

  async handleFunctionCall(event) {
    let output;
    try {
      const args = this.parseArgs(event.arguments);
      output = await this.dispatchFunctionCall(event, args);
    } catch (err) {
      const errorMessage = err?.message || String(err);
      this.error(`Function call error: ${errorMessage}`);
      this.error(`Error stack: ${err?.stack}`);
      output = { error: errorMessage };

      if (event.name === 'search_knowledge') {
        let parsedArgs = {};
        try {
          parsedArgs = this.parseArgs(event.arguments);
        } catch {
          parsedArgs = {};
        }
        this.emitSearchError({ errorMessage, args: parsedArgs });
      }
    }

    try {
      this.sendFunctionOutput(event.call_id, output);
    } catch (sendErr) {
      this.error(`Failed to send function output/response.create: ${sendErr.message}`);
    }
  }
}
