/**
 * Token Counter Service
 * 
 * Tracks token usage per ephemeral key to prevent excessive OpenAI API costs
 * during beta testing phase.
 */
import { createLogger } from '../utils/logger.js';

const logger = createLogger('token-counter');

class TokenCounter {
  constructor() {
    // Map of ephemeral key -> usage data
    this.keyUsage = new Map();
    
    // Default token limit per ephemeral key (configurable via env)
    this.defaultLimit = parseInt(process.env.MAX_TOKENS_PER_KEY || '15000');
    
    // Enable/disable token limiting
    this.enabled = process.env.TOKEN_LIMIT_ENABLED !== 'false';
    
    // OpenAI Realtime API pricing (as of 2024)
    this.pricing = {
      textInput: 0.000005,   // $5 / 1M tokens
      textOutput: 0.00002,   // $20 / 1M tokens
      audioInput: 0.00004,   // $40 / 1M tokens
      audioOutput: 0.00008   // $80 / 1M tokens
    };
    
    logger.log(`TokenCounter initialized: enabled=${this.enabled}, defaultLimit=${this.defaultLimit}`);
  }

  /**
   * Initialize tracking for a new ephemeral key
   */
  initializeKey(ephemeralKey, customLimit = null) {
    if (!ephemeralKey) {
      throw new Error('Ephemeral key is required');
    }

    const limit = customLimit || this.defaultLimit;
    
    this.keyUsage.set(ephemeralKey, {
      limit,
      estimatedTokens: 0,
      actualTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      // Detailed token breakdown
      textInputTokens: 0,
      audioInputTokens: 0,
      textOutputTokens: 0,
      audioOutputTokens: 0,
      // Cost tracking
      estimatedCost: 0,
      actualCost: 0,
      createdAt: new Date(),
      lastActivity: new Date(),
      requestCount: 0,
      conversationActive: false
    });

    logger.log(`Initialized token tracking for key: ${ephemeralKey.substring(0, 10)}... (limit: ${limit})`);
    
    return this.getUsage(ephemeralKey);
  }

  /**
   * Get usage data for an ephemeral key
   */
  getUsage(ephemeralKey) {
    if (!ephemeralKey) return null;
    
    const usage = this.keyUsage.get(ephemeralKey);
    if (!usage) return null;

    // Calculate current token usage (use actual if available, otherwise estimated)
    const currentTokens = usage.actualTokens > 0 ? usage.actualTokens : usage.estimatedTokens;
    const remainingTokens = Math.max(0, usage.limit - currentTokens);
    const usagePercent = Math.min(100, (currentTokens / usage.limit) * 100);

    return {
      ...usage,
      currentTokens,
      remainingTokens,
      usagePercent,
      isNearLimit: usagePercent >= 80,
      isAtLimit: currentTokens >= usage.limit
    };
  }

  /**
   * Update estimated token usage (for real-time feedback)
   */
  updateEstimatedTokens(ephemeralKey, deltaTokens) {
    if (!this.enabled || !ephemeralKey) return false;

    const usage = this.keyUsage.get(ephemeralKey);
    if (!usage) return false;

    usage.estimatedTokens += deltaTokens;
    usage.lastActivity = new Date();
    usage.requestCount++;

    return this.getUsage(ephemeralKey);
  }

  /**
   * Calculate cost based on token usage breakdown
   */
  calculateCost(textInputTokens, audioInputTokens, textOutputTokens, audioOutputTokens) {
    return (
      (textInputTokens * this.pricing.textInput) +
      (audioInputTokens * this.pricing.audioInput) +
      (textOutputTokens * this.pricing.textOutput) +
      (audioOutputTokens * this.pricing.audioOutput)
    );
  }

  /**
   * Update actual token usage from OpenAI API responses
   */
  updateActualUsage(ephemeralKey, usageData) {
    if (!this.enabled || !ephemeralKey) return false;

    const usage = this.keyUsage.get(ephemeralKey);
    if (!usage) return false;

    // Debug: Log the raw usage data from OpenAI
    logger.debug(`Raw OpenAI usage data for key ${ephemeralKey.substring(0, 10)}...:`, JSON.stringify(usageData, null, 2));

    // IMPORTANT: OpenAI Realtime API reports CUMULATIVE usage for the entire session
    // We need to set the actual tokens to the total reported by OpenAI, not add to it
    if (usageData.input_tokens !== undefined) {
      usage.inputTokens = usageData.input_tokens;
    }
    if (usageData.output_tokens !== undefined) {
      usage.outputTokens = usageData.output_tokens;
    }
    if (usageData.total_tokens !== undefined) {
      usage.actualTokens = usageData.total_tokens;
    } else {
      usage.actualTokens = usage.inputTokens + usage.outputTokens;
    }

    // Extract detailed token breakdown for cost calculation
    if (usageData.input_token_details) {
      usage.textInputTokens = usageData.input_token_details.text_tokens || 0;
      usage.audioInputTokens = usageData.input_token_details.audio_tokens || 0;
    }
    if (usageData.output_token_details) {
      usage.textOutputTokens = usageData.output_token_details.text_tokens || 0;
      usage.audioOutputTokens = usageData.output_token_details.audio_tokens || 0;
    }

    // Calculate actual cost
    usage.actualCost = this.calculateCost(
      usage.textInputTokens,
      usage.audioInputTokens,
      usage.textOutputTokens,
      usage.audioOutputTokens
    );

    // Reset estimated tokens since we now have accurate data
    usage.estimatedTokens = 0;

    usage.lastActivity = new Date();

    logger.log(`Updated actual usage for key ${ephemeralKey.substring(0, 10)}...: ${usage.actualTokens} tokens (input: ${usage.inputTokens}, output: ${usage.outputTokens}) [CUMULATIVE SESSION TOTAL]`);
    logger.log(`  → Cost breakdown: Text In: $${(usage.textInputTokens * this.pricing.textInput).toFixed(4)}, Audio In: $${(usage.audioInputTokens * this.pricing.audioInput).toFixed(4)}, Text Out: $${(usage.textOutputTokens * this.pricing.textOutput).toFixed(4)}, Audio Out: $${(usage.audioOutputTokens * this.pricing.audioOutput).toFixed(4)}`);
    logger.log(`  → Total estimated cost: $${usage.actualCost.toFixed(4)}`);
    
    return this.getUsage(ephemeralKey);
  }

  /**
   * Estimate tokens from text content (for real-time estimation)
   */
  estimateTokensFromText(text) {
    if (!text) return 0;
    
    // More accurate estimation using word count
    // OpenAI models average ~1.3 tokens per word for English text
    const wordCount = text.split(/\s+/).length;
    return Math.ceil(wordCount * 1.3);
  }

  /**
   * Estimate tokens from audio duration (for voice input)
   */
  estimateTokensFromAudio(durationSeconds) {
    if (!durationSeconds || durationSeconds <= 0) return 0;
    
    // OpenAI Realtime API: approximately 150 tokens per minute of audio
    const tokensPerSecond = 150 / 60;
    return Math.ceil(durationSeconds * tokensPerSecond);
  }

  /**
   * Check if an ephemeral key can make more requests
   */
  canMakeRequest(ephemeralKey) {
    if (!this.enabled) return { allowed: true, reason: 'disabled' };
    
    const usage = this.getUsage(ephemeralKey);
    if (!usage) return { allowed: false, reason: 'key_not_found' };
    
    if (usage.isAtLimit) {
      return { 
        allowed: false, 
        reason: 'token_limit_exceeded',
        usage 
      };
    }
    
    return { allowed: true, usage };
  }

  /**
   * Mark conversation as active/inactive
   */
  setConversationActive(ephemeralKey, active) {
    if (!ephemeralKey) return;
    
    const usage = this.keyUsage.get(ephemeralKey);
    if (usage) {
      usage.conversationActive = active;
      usage.lastActivity = new Date();
    }
  }

  /**
   * Clean up expired keys (older than 1 hour)
   */
  cleanupExpiredKeys() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [key, usage] of this.keyUsage.entries()) {
      if (usage.lastActivity < oneHourAgo && !usage.conversationActive) {
        this.keyUsage.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.log(`Cleaned up ${cleanedCount} expired token tracking entries`);
    }
  }

  /**
   * Get all usage statistics (for monitoring)
   */
  getAllUsageStats() {
    const stats = {
      totalKeys: this.keyUsage.size,
      activeConversations: 0,
      totalTokensUsed: 0,
      totalCostEstimated: 0,
      keysAtLimit: 0,
      keysNearLimit: 0,
      enabled: this.enabled,
      defaultLimit: this.defaultLimit
    };

    for (const usage of this.keyUsage.values()) {
      if (usage.conversationActive) stats.activeConversations++;
      stats.totalTokensUsed += usage.actualTokens || usage.estimatedTokens;
      stats.totalCostEstimated += usage.actualCost || usage.estimatedCost;
      
      const usagePercent = ((usage.actualTokens || usage.estimatedTokens) / usage.limit) * 100;
      if (usagePercent >= 100) stats.keysAtLimit++;
      else if (usagePercent >= 80) stats.keysNearLimit++;
    }

    return stats;
  }

  /**
   * Reset usage for a specific key (for testing)
   */
  resetKey(ephemeralKey) {
    if (!ephemeralKey) return false;
    
    const usage = this.keyUsage.get(ephemeralKey);
    if (!usage) return false;

    usage.estimatedTokens = 0;
    usage.actualTokens = 0;
    usage.inputTokens = 0;
    usage.outputTokens = 0;
    usage.requestCount = 0;
    usage.lastActivity = new Date();

    logger.log(`Reset token usage for key: ${ephemeralKey.substring(0, 10)}...`);
    return true;
  }
}

// Create singleton instance
const tokenCounter = new TokenCounter();

// Start cleanup interval (every 15 minutes)
setInterval(() => {
  tokenCounter.cleanupExpiredKeys();
}, 15 * 60 * 1000);

export default tokenCounter;
