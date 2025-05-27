// src/ui/dialoguePanel.js

/**
 * DialoguePanel: renders a side panel of utterances with embedded audio playback.
 */
export const DialoguePanel = {
    container: /** @type {HTMLElement|null} */ (null),
  
    /**
     * Initialize the panel and attach to DOM
     */
    init() {
      if (this.container) return;
  
      const panel = document.createElement('aside');
      panel.id = 'dialogue-panel';
      Object.assign(panel.style, {
        position: 'fixed',
        top: '0',
        right: '0',
        width: '300px',
        maxHeight: '40vh',
        overflowY: 'auto',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        padding: '10px',
        fontFamily: 'sans-serif',
        zIndex: '1002',
        boxShadow: '0 0 10px rgba(0,0,0,0.3)'
      });
  
      const title = document.createElement('h3');
      title.innerText = 'Dialogue';
      title.style.margin = '0 0 8px';
      panel.appendChild(title);
  
      document.body.appendChild(panel);
      this.container = panel;
    },
  
    /**
     * Add a new utterance record to the panel
     * @param {{id:string, speaker:string, timestamp:number, text:string, audioURL?:string, audioBlob?:Blob}} record
     */
    add(record) {
      if (!this.container) this.init();
  
      // Create entry container
      const entry = document.createElement('div');
      entry.className = 'dialogue-entry';
      Object.assign(entry.style, {
        borderBottom: '1px solid #ccc',
        padding: '6px 0',
        display: 'flex',
        flexDirection: 'column'
      });
  
      // Metadata: speaker and timestamp
      const meta = document.createElement('div');
      meta.innerText = `${record.speaker.toUpperCase()} @ ${new Date(record.timestamp).toLocaleTimeString()}`;
      Object.assign(meta.style, {
        fontSize: '12px',
        color: '#666'
      });
  
      // Text and audio player
      const line = document.createElement('div');
      line.style.display = 'flex';
      line.style.flexDirection = 'column';
      line.style.alignItems = 'flex-start';
  
      const textSpan = document.createElement('span');
      textSpan.innerText = record.text;
      textSpan.style.fontSize = '14px';
      textSpan.style.marginBottom = '4px';
      line.appendChild(textSpan);
  
      const url = record.audioURL || (record.audioBlob ? URL.createObjectURL(record.audioBlob) : null);
      if (url) {
        const audioEl = document.createElement('audio');
        audioEl.controls = true;
        audioEl.src = url;
        audioEl.style.width = '100%';
        line.appendChild(audioEl);
      }
  
      entry.appendChild(meta);
      entry.appendChild(line);
      this.container.appendChild(entry);
  
      // Prune oldest if >20 entries
      const entries = this.container.querySelectorAll('.dialogue-entry');
      if (entries.length > 20) {
        this.container.removeChild(entries[0]);
      }
    }
  };