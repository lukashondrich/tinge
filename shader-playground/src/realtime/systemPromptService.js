import jsyaml from 'js-yaml';

export class SystemPromptService {
  constructor({
    fetchFn = (...args) => globalThis.fetch(...args),
    yamlLoad = (value) => jsyaml.load(value),
    error = () => {}
  } = {}) {
    this.fetchFn = fetchFn;
    this.yamlLoad = yamlLoad;
    this.error = error;
  }

  async loadPromptText({
    promptPath = '/prompts/systemPrompt.yaml'
  } = {}) {
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

      return promptText;
    } catch (err) {
      this.error(`Failed to load system prompt YAML: ${err.message}`);
      throw err;
    }
  }
}
