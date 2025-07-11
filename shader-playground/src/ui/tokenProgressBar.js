/**
 * Retro 80s Token Progress Bar Component
 * 
 * Displays token usage with a bright green neon progress bar
 * with VHS-style scanlines and retro aesthetic
 */

export class TokenProgressBar {
  constructor(containerId = 'token-progress-container') {
    this.container = null;
    this.progressBar = null;
    this.progressFill = null;
    this.usageText = null;
    this.warningText = null;
    this.containerId = containerId;
    
    this.currentUsage = {
      currentTokens: 0,
      limit: 15000,
      usagePercent: 0,
      isNearLimit: false,
      isAtLimit: false
    };
    
    this.init();
  }

  init() {
    this.createContainer();
    this.createProgressBar();
    this.createUsageText();
    this.createWarningText();
    this.applyStyles();
    this.hide(); // Start hidden
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.id = this.containerId;
    this.container.className = 'token-progress-container';
    document.body.appendChild(this.container);
  }

  createProgressBar() {
    // Progress bar wrapper
    const progressWrapper = document.createElement('div');
    progressWrapper.className = 'token-progress-wrapper';
    
    // Progress bar background
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'token-progress-bar';
    
    // Progress fill
    this.progressFill = document.createElement('div');
    this.progressFill.className = 'token-progress-fill';
    
    // Scanlines overlay
    const scanlines = document.createElement('div');
    scanlines.className = 'token-progress-scanlines';
    
    this.progressBar.appendChild(this.progressFill);
    this.progressBar.appendChild(scanlines);
    progressWrapper.appendChild(this.progressBar);
    this.container.appendChild(progressWrapper);
  }

  createUsageText() {
    this.usageText = document.createElement('div');
    this.usageText.className = 'token-usage-text';
    this.usageText.textContent = '0 / 15000 TOKENS';
    this.container.appendChild(this.usageText);
  }

  createWarningText() {
    this.warningText = document.createElement('div');
    this.warningText.className = 'token-warning-text';
    this.warningText.textContent = '';
    this.container.appendChild(this.warningText);
  }

  applyStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .token-progress-container {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        width: 280px;
        background: rgba(0, 0, 0, 0.9);
        border: 2px solid #00ff41;
        border-radius: 8px;
        padding: 12px;
        font-family: 'DM Mono', 'Courier New', monospace;
        z-index: 2000;
        box-shadow: 
          0 0 10px rgba(0, 255, 65, 0.3),
          inset 0 0 10px rgba(0, 255, 65, 0.1);
        backdrop-filter: blur(5px);
        transition: all 0.3s ease;
      }

      .token-progress-container:hover {
        box-shadow: 
          0 0 20px rgba(0, 255, 65, 0.5),
          inset 0 0 15px rgba(0, 255, 65, 0.2);
      }

      .token-progress-wrapper {
        margin-bottom: 8px;
      }

      .token-progress-bar {
        position: relative;
        width: 100%;
        height: 20px;
        background: linear-gradient(90deg, 
          rgba(0, 20, 0, 0.8) 0%, 
          rgba(0, 40, 0, 0.8) 50%, 
          rgba(0, 20, 0, 0.8) 100%);
        border: 1px solid #00ff41;
        border-radius: 4px;
        overflow: hidden;
        box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.5);
      }

      .token-progress-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg,
          #00ff41 0%,
          #00cc33 25%,
          #00ff41 50%,
          #00cc33 75%,
          #00ff41 100%);
        border-radius: 3px;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        box-shadow: 
          0 0 10px rgba(0, 255, 65, 0.6),
          inset 0 0 5px rgba(255, 255, 255, 0.3);
      }

      .token-progress-fill::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, 
          transparent 0%, 
          rgba(255, 255, 255, 0.4) 50%, 
          transparent 100%);
        animation: tokenProgressShine 2s infinite;
      }

      @keyframes tokenProgressShine {
        0% { left: -100%; }
        100% { left: 100%; }
      }

      .token-progress-fill.warning {
        background: linear-gradient(90deg,
          #ffaa00 0%,
          #ff8800 25%,
          #ffaa00 50%,
          #ff8800 75%,
          #ffaa00 100%);
        box-shadow: 
          0 0 10px rgba(255, 170, 0, 0.6),
          inset 0 0 5px rgba(255, 255, 255, 0.3);
      }

      .token-progress-fill.danger {
        background: linear-gradient(90deg,
          #ff0040 0%,
          #cc0033 25%,
          #ff0040 50%,
          #cc0033 75%,
          #ff0040 100%);
        box-shadow: 
          0 0 10px rgba(255, 0, 64, 0.6),
          inset 0 0 5px rgba(255, 255, 255, 0.3);
        animation: tokenProgressPulse 1s infinite alternate;
      }

      @keyframes tokenProgressPulse {
        0% { opacity: 0.8; }
        100% { opacity: 1; }
      }

      .token-progress-scanlines {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: repeating-linear-gradient(
          90deg,
          transparent 0px,
          transparent 2px,
          rgba(0, 255, 65, 0.1) 2px,
          rgba(0, 255, 65, 0.1) 4px
        );
        pointer-events: none;
      }

      .token-usage-text {
        color: #00ff41;
        font-size: 12px;
        font-weight: 500;
        text-align: center;
        margin-bottom: 4px;
        text-shadow: 0 0 5px rgba(0, 255, 65, 0.5);
        letter-spacing: 1px;
      }

      .token-usage-text.warning {
        color: #ffaa00;
        text-shadow: 0 0 5px rgba(255, 170, 0, 0.5);
      }

      .token-usage-text.danger {
        color: #ff0040;
        text-shadow: 0 0 5px rgba(255, 0, 64, 0.5);
        animation: tokenTextPulse 1s infinite alternate;
      }

      @keyframes tokenTextPulse {
        0% { opacity: 0.8; }
        100% { opacity: 1; }
      }

      .token-warning-text {
        color: #ffaa00;
        font-size: 10px;
        text-align: center;
        text-shadow: 0 0 3px rgba(255, 170, 0, 0.5);
        min-height: 12px;
        letter-spacing: 0.5px;
      }

      .token-warning-text.danger {
        color: #ff0040;
        text-shadow: 0 0 3px rgba(255, 0, 64, 0.5);
        animation: tokenWarningPulse 1s infinite alternate;
      }

      @keyframes tokenWarningPulse {
        0% { opacity: 0.7; }
        100% { opacity: 1; }
      }

      /* Mobile responsive */
      @media (max-width: 600px) {
        .token-progress-container {
          width: calc(100vw - 40px);
          max-width: 280px;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
        }
      }

      /* Hide when not visible */
      .token-progress-container.hidden {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
        pointer-events: none;
      }
    `;
    
    // Check if style already exists
    if (!document.querySelector('#token-progress-styles')) {
      style.id = 'token-progress-styles';
      document.head.appendChild(style);
    }
  }

  updateUsage(usage) {
    this.currentUsage = { ...this.currentUsage, ...usage };
    
    // Update progress bar
    const percent = Math.min(100, this.currentUsage.usagePercent || 0);
    this.progressFill.style.width = `${percent}%`;
    
    // Update colors based on usage level
    this.progressFill.className = 'token-progress-fill';
    this.usageText.className = 'token-usage-text';
    this.warningText.className = 'token-warning-text';
    
    if (this.currentUsage.isAtLimit) {
      this.progressFill.classList.add('danger');
      this.usageText.classList.add('danger');
      this.warningText.classList.add('danger');
      this.warningText.textContent = 'TOKEN LIMIT REACHED';
    } else if (this.currentUsage.isNearLimit) {
      this.progressFill.classList.add('warning');
      this.usageText.classList.add('warning');
      this.warningText.textContent = 'APPROACHING LIMIT';
    } else {
      this.warningText.textContent = '';
    }
    
    // Update usage text
    const current = this.currentUsage.currentTokens || 0;
    const limit = this.currentUsage.limit || 2000;
    this.usageText.textContent = `${current} / ${limit} TOKENS`;
    
    // Show the progress bar when there's usage
    if (current > 0) {
      this.show();
    }
  }

  show() {
    this.container.classList.remove('hidden');
  }

  hide() {
    this.container.classList.add('hidden');
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    // Remove styles
    const styles = document.querySelector('#token-progress-styles');
    if (styles) {
      styles.parentNode.removeChild(styles);
    }
  }

  // Public API methods
  setLimit(newLimit) {
    this.currentUsage.limit = newLimit;
    this.updateUsage(this.currentUsage);
  }

  reset() {
    this.updateUsage({
      currentTokens: 0,
      usagePercent: 0,
      isNearLimit: false,
      isAtLimit: false
    });
    this.hide();
  }

  // Get current usage data
  getUsage() {
    return { ...this.currentUsage };
  }
}