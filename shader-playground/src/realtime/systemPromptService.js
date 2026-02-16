import jsyaml from 'js-yaml';

export class SystemPromptService {
  constructor({
    fetchFn = (...args) => globalThis.fetch(...args),
    yamlLoad = (value) => jsyaml.load(value),
    makeEventId = () => crypto.randomUUID(),
    error = () => {}
  } = {}) {
    this.fetchFn = fetchFn;
    this.yamlLoad = yamlLoad;
    this.makeEventId = makeEventId;
    this.error = error;
  }

  async sendSystemPrompt({
    dataChannel,
    promptPath = '/prompts/systemPrompt.yaml'
  } = {}) {
    if (!dataChannel || typeof dataChannel.send !== 'function') {
      this.error('Failed to load system prompt YAML: data channel is unavailable');
      return false;
    }

    try {
      const response = await this.fetchFn(promptPath);
      if (!response.ok) {
        throw new Error(`YAML load failed: ${response.status}`);
      }

      const yamlText = await response.text();
      const parsed = this.yamlLoad(yamlText) || {};
      const promptText = typeof parsed.prompt === 'string'
        ? parsed.prompt.trim()
        : '';

      if (!promptText) {
        throw new Error('YAML prompt is empty or missing "prompt" field');
      }

      dataChannel.send(JSON.stringify({
        type: 'conversation.item.create',
        event_id: this.makeEventId(),
        item: {
          type: 'message',
          role: 'system',
          content: [
            { type: 'input_text', text: promptText }
          ]
        }
      }));
      return true;
    } catch (err) {
      this.error(`Failed to load system prompt YAML: ${err.message}`);
      return false;
    }
  }
}
