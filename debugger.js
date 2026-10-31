/**
 * Nabla Ad Shield — Telemetry & Diagnostics Controller
 * Real-time event log ingestion, category filtering, search querying,
 * metrics computing, and single-click export.
 */

import { ParticleConstellation } from './shared/particle_canvas.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize background particle constellation
  const canvas = document.getElementById('debugger-canvas');
  if (canvas) {
    new ParticleConstellation(canvas, {
      particleCount: 50,
      maxDistance: 100,
      baseSpeed: 0.25
    });
  }

  // DOM references
  const logsTbody = document.getElementById('logs-tbody');
  const emptyState = document.getElementById('empty-state');
  const filterTabs = document.getElementById('filter-tabs');
  const searchInput = document.getElementById('search-input');
  const pauseStreamBtn = document.getElementById('pause-stream-btn');
  const liveIndicator = document.getElementById('live-indicator');
  const copyBtn = document.getElementById('copy-btn');
  const exportBtn = document.getElementById('export-btn');
  const clearBtn = document.getElementById('clear-btn');
  const toast = document.getElementById('toast');

  // Metrics elements
  const metricTotal = document.getElementById('metric-total');
  const metricNetwork = document.getElementById('metric-network');
  const metricYoutube = document.getElementById('metric-youtube');
  const metricHeuristic = document.getElementById('metric-heuristic');
  const metricCookie = document.getElementById('metric-cookie');

  // Count tags
  const countAll = document.getElementById('count-all');
  const countNetwork = document.getElementById('count-network');
  const countYoutube = document.getElementById('count-youtube');
  const countHeuristic = document.getElementById('count-heuristic');
  const countCosmetic = document.getElementById('count-cosmetic');
  const countCookie = document.getElementById('count-cookie');
  const countSystem = document.getElementById('count-system');

  let logs = [];
  let activeCategory = 'ALL';
  let searchTerm = '';
  let isStreamPaused = false;
  let expandedRowIds = new Set();

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  // Fetch initial logs from background worker
  async function loadLogs() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'NABLA_GET_LOGS' });
      if (res && Array.isArray(res.logs)) {
        logs = res.logs;
        render();
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    }
  }

  // Real-time listener for incoming events (coalesced onto animation frames)
  let renderRafId = null;
  function scheduleRender() {
    if (renderRafId) return;
    renderRafId = requestAnimationFrame(() => {
      renderRafId = null;
      render();
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'NABLA_NEW_LOG' && message.event) {
      if (!isStreamPaused) {
        logs.unshift(message.event);
        if (logs.length > 800) logs.pop();
        scheduleRender();
      }
    }
  });

  function updateMetrics() {
    const counts = {
      TOTAL: logs.length,
      NETWORK: 0,
      YOUTUBE: 0,
      HEURISTIC: 0,
      COSMETIC: 0,
      COOKIE: 0,
      SYSTEM: 0
    };

    for (const log of logs) {
      if (counts[log.category] !== undefined) {
        counts[log.category]++;
      }
    }

    metricTotal.textContent = counts.TOTAL.toLocaleString();
    metricNetwork.textContent = counts.NETWORK.toLocaleString();
    metricYoutube.textContent = counts.YOUTUBE.toLocaleString();
    metricHeuristic.textContent = counts.HEURISTIC.toLocaleString();
    metricCookie.textContent = counts.COOKIE.toLocaleString();

    countAll.textContent = counts.TOTAL;
    countNetwork.textContent = counts.NETWORK;
    countYoutube.textContent = counts.YOUTUBE;
    countHeuristic.textContent = counts.HEURISTIC;
    countCosmetic.textContent = counts.COSMETIC;
    countCookie.textContent = counts.COOKIE;
    countSystem.textContent = counts.SYSTEM;
  }

  function getFilteredLogs() {
    return logs.filter((log) => {
      // Category filter
      if (activeCategory !== 'ALL' && log.category !== activeCategory) {
        return false;
      }

      // Search query filter
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const msg = (log.message || '').toLowerCase();
        const url = (log.url || '').toLowerCase();
        const details = JSON.stringify(log.details || {}).toLowerCase();
        return msg.includes(query) || url.includes(query) || details.includes(query);
      }

      return true;
    });
  }

  function formatTime(isoString) {
    if (!isoString) return '--:--:--';
    try {
      const d = new Date(isoString);
      return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
    } catch {
      return isoString;
    }
  }

  function render() {
    updateMetrics();
    const filtered = getFilteredLogs();

    if (filtered.length === 0) {
      logsTbody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    const rowsHtml = filtered.map((log) => {
      const isExpanded = expandedRowIds.has(log.id);
      const categoryClass = `badge-${(log.category || 'system').toLowerCase()}`;
      const statusClass = log.level === 'BLOCKED' ? 'status-pill-blocked' : 'status-pill-info';

      const detailsJson = JSON.stringify(log.details || {}, null, 2);
      const detailsSummary = Object.entries(log.details || {})
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' | ');

      return `
        <tr class="log-row" data-id="${log.id}">
          <td class="log-time">${formatTime(log.timestamp)}</td>
          <td><span class="badge ${categoryClass}">${log.category || 'SYSTEM'}</span></td>
          <td><span class="${statusClass}">${log.level || 'INFO'}</span></td>
          <td>
            <span class="log-url" title="${escapeHtml(log.url || '')}">
              ${escapeHtml(log.url || 'Internal Background Context')}
            </span>
          </td>
          <td>
            <div class="log-message">${escapeHtml(log.message || '')}</div>
            ${detailsSummary ? `<div class="log-details-preview">${escapeHtml(detailsSummary)}</div>` : ''}
            ${
              isExpanded
                ? `<pre class="log-expanded-details"><code>${escapeHtml(detailsJson)}</code></pre>`
                : ''
            }
          </td>
        </tr>
      `;
    }).join('');

    logsTbody.innerHTML = rowsHtml;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Row expand/collapse click handler
  logsTbody.addEventListener('click', (e) => {
    const row = e.target.closest('.log-row');
    if (!row) return;
    const logId = row.dataset.id;
    if (expandedRowIds.has(logId)) {
      expandedRowIds.delete(logId);
    } else {
      expandedRowIds.add(logId);
    }
    render();
  });

  // Filter tabs click handler
  filterTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;

    filterTabs.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    activeCategory = btn.dataset.category || 'ALL';
    render();
  });

  // Search input handler
  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    render();
  });

  // Pause / Resume live streaming
  pauseStreamBtn.addEventListener('click', () => {
    isStreamPaused = !isStreamPaused;
    if (isStreamPaused) {
      pauseStreamBtn.textContent = 'Resume';
      liveIndicator.classList.add('paused');
      liveIndicator.querySelector('.live-text').textContent = 'STREAM PAUSED';
    } else {
      pauseStreamBtn.textContent = 'Pause';
      liveIndicator.classList.remove('paused');
      liveIndicator.querySelector('.live-text').textContent = 'STREAMING LIVE';
      loadLogs();
    }
  });

  // Copy full log buffer as JSON
  copyBtn.addEventListener('click', async () => {
    const filtered = getFilteredLogs();
    const payload = JSON.stringify(filtered, null, 2);

    try {
      await navigator.clipboard.writeText(payload);
      showToast(`Copied ${filtered.length} diagnostic logs to clipboard!`);
    } catch (err) {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(`Copied ${filtered.length} diagnostic logs to clipboard!`);
    }
  });

  // Download log report as JSON file
  exportBtn.addEventListener('click', () => {
    const filtered = getFilteredLogs();
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nabla-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Diagnostic report downloaded!');
  });

  // Clear buffer
  clearBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear the audit log buffer?')) {
      await chrome.runtime.sendMessage({ type: 'NABLA_CLEAR_LOGS' });
      logs = [];
      expandedRowIds.clear();
      render();
      showToast('Log buffer cleared.');
    }
  });

  // Initial load
  await loadLogs();
});
