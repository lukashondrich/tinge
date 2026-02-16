export class FunctionCallService {
  constructor({
    getUserProfile,
    updateUserProfile,
    searchKnowledge,
    verifyCorrection = null,
    onEvent,
    sendJson,
    makeEventId = () => crypto.randomUUID(),
    makeCorrectionId = () => `corr_${crypto.randomUUID()}`,
    nowIso = () => new Date().toISOString(),
    error = () => {}
  }) {
    this.getUserProfile = getUserProfile;
    this.updateUserProfile = updateUserProfile;
    this.searchKnowledge = searchKnowledge;
    this.verifyCorrection = verifyCorrection;
    this.onEvent = onEvent;
    this.sendJson = sendJson;
    this.makeEventId = makeEventId;
    this.makeCorrectionId = makeCorrectionId;
    this.nowIso = nowIso;
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

  normalizeCorrectionArgs(args = {}) {
    const original = typeof args.original === 'string' ? args.original.trim() : '';
    const corrected = typeof args.corrected === 'string' ? args.corrected.trim() : '';
    const correctionType = typeof args.correction_type === 'string'
      ? args.correction_type.trim()
      : '';
    const allowedCorrectionTypes = new Set([
      'grammar',
      'vocabulary',
      'pronunciation',
      'style_register'
    ]);

    if (!original || !corrected || !correctionType) {
      return { error: 'log_correction requires original, corrected, and correction_type' };
    }
    if (!allowedCorrectionTypes.has(correctionType)) {
      return { error: `Invalid correction_type: ${correctionType}` };
    }

    const normalized = {
      id: this.makeCorrectionId(),
      original,
      corrected,
      correction_type: correctionType,
      source: 'tool_call',
      status: 'detected',
      detected_at: this.nowIso()
    };

    if (typeof args.learner_excerpt === 'string' && args.learner_excerpt.trim()) {
      normalized.learner_excerpt = args.learner_excerpt.trim();
    }
    if (typeof args.assistant_excerpt === 'string' && args.assistant_excerpt.trim()) {
      normalized.assistant_excerpt = args.assistant_excerpt.trim();
    }

    return normalized;
  }

  emitCorrectionDetected(correction) {
    this.onEvent?.({
      type: 'tool.log_correction.detected',
      correction
    });
  }

  async triggerCorrectionVerification(correction) {
    if (typeof this.verifyCorrection !== 'function') return;

    this.onEvent?.({
      type: 'correction.verification.started',
      correctionId: correction.id,
      correction
    });

    try {
      const verificationResult = await this.verifyCorrection({
        correction_id: correction.id,
        original: correction.original,
        corrected: correction.corrected,
        correction_type: correction.correction_type
      });
      const verification = verificationResult?.data || verificationResult;
      this.onEvent?.({
        type: 'correction.verification.succeeded',
        correctionId: correction.id,
        correction,
        verification
      });
    } catch (err) {
      const errorMessage = err?.message || String(err);
      this.error(`Correction verification error: ${errorMessage}`);
      this.onEvent?.({
        type: 'correction.verification.failed',
        correctionId: correction.id,
        correction,
        error: errorMessage
      });
    }
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
    if (event.name === 'log_correction') {
      const correction = this.normalizeCorrectionArgs(args);
      if (correction.error) {
        return { error: correction.error };
      }
      this.emitCorrectionDetected(correction);
      void this.triggerCorrectionVerification(correction);
      return {
        success: true,
        correction_id: correction.id
      };
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
