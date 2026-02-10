const SOURCE_REGISTRY_STORAGE_KEY = 'tinge-source-registry-v1';

export class SourcePanel {
  constructor({ maxVisible = 4, persistAcrossReloads = false } = {}) {
    this.maxVisible = maxVisible;
    this.persistAcrossReloads = Boolean(persistAcrossReloads);
    this.sources = [];
    this.sourcesByKey = new Map();
    this.nextDisplayIndex = 1;
    this.telemetry = null;
    this.expanded = false;
    if (this.persistAcrossReloads) {
      this._loadRegistry();
    } else if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(SOURCE_REGISTRY_STORAGE_KEY);
      } catch (error) {
        // Ignore storage access failures in locked-down browser contexts.
      }
    }
    this._build();
  }

  _build() {
    this.container = document.createElement('section');
    this.container.id = 'sourcePanel';
    this.container.className = 'source-panel';

    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'source-panel-toggle';
    this.toggle.textContent = 'Sources';
    this.toggle.title = 'Open sources panel';
    this.toggle.addEventListener('click', () => {
      this.expanded = !this.expanded;
      this._syncExpandedState();
    });

    this.body = document.createElement('div');
    this.body.className = 'source-panel-body';

    const title = document.createElement('div');
    title.className = 'source-panel-title';
    title.textContent = 'Latest Sources';

    this.status = document.createElement('div');
    this.status.className = 'source-panel-status';

    this.list = document.createElement('ol');
    this.list.className = 'source-panel-list';

    this.empty = document.createElement('p');
    this.empty.className = 'source-panel-empty';
    this.empty.textContent = 'No sources yet.';

    this.body.appendChild(title);
    this.body.appendChild(this.status);
    this.body.appendChild(this.empty);
    this.body.appendChild(this.list);

    this.container.appendChild(this.toggle);
    this.container.appendChild(this.body);
    document.body.appendChild(this.container);
    this._renderStatus();
    this._render();
    this._syncExpandedState();
  }

  _sourceKey(item = {}) {
    return [
      String(item.url || '').trim().toLowerCase(),
      String(item.title || '').trim().toLowerCase(),
      String(item.source || '').trim().toLowerCase(),
      String(item.language || '').trim().toLowerCase()
    ].join('|');
  }

  getSourceKey(item = {}) {
    return this._sourceKey(item);
  }

  _loadRegistry() {
    if (!this.persistAcrossReloads) return;
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(SOURCE_REGISTRY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
      entries.forEach((entry) => {
        if (!entry || typeof entry.key !== 'string' || !entry.value) return;
        this.sourcesByKey.set(entry.key, entry.value);
      });
      const maxId = Array.from(this.sourcesByKey.values()).reduce((acc, item) => {
        const id = Number(item?.display_index || 0);
        return Number.isFinite(id) ? Math.max(acc, id) : acc;
      }, 0);
      const storedNext = Number(parsed?.nextDisplayIndex || 0);
      this.nextDisplayIndex = Math.max(maxId + 1, storedNext || 1);
      this.sources = Array.from(this.sourcesByKey.values())
        .sort((a, b) => (a.display_index || 0) - (b.display_index || 0));
    } catch (error) {
      // Ignore corrupt storage payloads and rebuild from scratch.
      this.sourcesByKey.clear();
      this.sources = [];
      this.nextDisplayIndex = 1;
    }
  }

  _persistRegistry() {
    if (!this.persistAcrossReloads) return;
    if (typeof sessionStorage === 'undefined') return;
    try {
      const entries = Array.from(this.sourcesByKey.entries()).map(([key, value]) => ({ key, value }));
      sessionStorage.setItem(SOURCE_REGISTRY_STORAGE_KEY, JSON.stringify({
        entries,
        nextDisplayIndex: this.nextDisplayIndex
      }));
    } catch (error) {
      // Ignore storage quota or serialization failures.
    }
  }

  getDisplayIndexForSource(item = {}) {
    const key = this._sourceKey(item);
    const existing = this.sourcesByKey.get(key);
    if (existing && Number.isFinite(Number(existing.display_index))) {
      return Number(existing.display_index);
    }

    const displayIndex = this.nextDisplayIndex++;
    this.sourcesByKey.set(key, { ...item, display_index: displayIndex });
    this._persistRegistry();
    return displayIndex;
  }

  getExistingDisplayIndexForSource(item = {}) {
    const key = this._sourceKey(item);
    const existing = this.sourcesByKey.get(key);
    if (existing && Number.isFinite(Number(existing.display_index))) {
      return Number(existing.display_index);
    }
    return null;
  }

  getNextDisplayIndex() {
    return this.nextDisplayIndex;
  }

  _syncExpandedState() {
    this.container.classList.toggle('expanded', this.expanded);
    this.body.style.display = this.expanded ? 'block' : 'none';
    const base = this.expanded ? 'Hide Sources' : 'Sources';
    const count = this.sourcesByKey.size;
    this.toggle.textContent = count > 0 ? `${base} (${count})` : base;
  }

  updateFromSearchResults(results = []) {
    for (const item of results) {
      const sourceKey = this._sourceKey(item);
      const displayIndex = this.getDisplayIndexForSource(item);
      const existing = this.sourcesByKey.get(sourceKey) || {};
      this.sourcesByKey.set(sourceKey, {
        ...existing,
        ...item,
        display_index: displayIndex
      });
    }

    this.sources = Array.from(this.sourcesByKey.values())
      .sort((a, b) => (a.display_index || 0) - (b.display_index || 0));
    this._persistRegistry();
    this._render();
    this._syncExpandedState();
  }

  updateTelemetry(telemetry = null) {
    this.telemetry = telemetry;
    this._renderStatus();
  }

  _renderStatus() {
    if (!this.status) return;
    if (!this.telemetry) {
      this.status.textContent = 'No retrieval yet.';
      this.status.classList.remove('error');
      return;
    }

    const query = this.telemetry.queryOriginal || this.telemetry.queryEn || 'n/a';
    const resultCount = typeof this.telemetry.resultCount === 'number'
      ? this.telemetry.resultCount
      : 0;
    const durationMs = typeof this.telemetry.durationMs === 'number'
      ? this.telemetry.durationMs
      : 0;
    const status = this.telemetry.status || 'unknown';
    const citedCount = typeof this.telemetry.citedCount === 'number'
      ? this.telemetry.citedCount
      : null;

    this.status.classList.toggle('error', status === 'error');
    const citedSegment = citedCount === null ? '' : ` | C: ${citedCount}`;
    this.status.textContent = `Q: ${query} | R: ${resultCount}${citedSegment} | ${durationMs}ms | ${status}`;
  }

  _render() {
    this._renderStatus();
    this.list.innerHTML = '';
    if (this.sources.length === 0) {
      this.empty.style.display = 'block';
      return;
    }

    this.empty.style.display = 'none';
    this.sources.forEach((source, idx) => {
      const li = document.createElement('li');
      li.className = 'source-panel-item';

      const a = document.createElement('a');
      a.href = source.url || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'source-panel-link';
      const citationLabel = source.display_index || (idx + 1);
      a.textContent = `${citationLabel}. ${source.title || source.source || 'Untitled source'}`;
      if (!source.url) {
        a.removeAttribute('href');
      }

      const meta = document.createElement('span');
      meta.className = 'source-panel-meta';
      meta.textContent = source.source || source.language || '';

      li.appendChild(a);
      if (meta.textContent) {
        li.appendChild(meta);
      }
      this.list.appendChild(li);
    });

    // Roughly show 4 items before scrolling.
    this.list.style.maxHeight = `${this.maxVisible * 42}px`;
  }
}
