/**
 * main.js — Main orchestrator for FlytBase: Aerial Traffic Analysis & CCTV Number Plate Extraction.
 * Two completely independent capabilities operating side-by-side.
 */

import './style.css';
import {
  uploadVideo,
  subscribeProgress,
  getResults,
  uploadCctvVideo,
  subscribeCctvProgress,
  getCctvResults,
} from './api.js';
import { renderHome } from './components/home.js';
import { renderDashboard } from './components/dashboard.js';
import { renderCctvResults } from './components/cctv-results.js';
import { formatDuration, formatNumber } from './utils/format.js';

const app = document.getElementById('app');

// State
let currentView = 'HOME'; // 'HOME' | 'AERIAL_PROGRESS' | 'AERIAL_DASHBOARD' | 'CCTV_PROGRESS' | 'CCTV_RESULTS'

let aerialState = {
  jobId: null,
  filename: null,
  progress: { processed: 0, total: 0, fps: 0, eta_s: 0, count: 0 },
  results: null,
  eventSource: null,
  error: null,
};

let cctvState = {
  jobId: null,
  filename: null,
  progress: { progress_pct: 0, processed_frames: 0, total_frames: 0, vehicles_tracked: 0, message: '' },
  results: null,
  eventSource: null,
  error: null,
};

function renderHeader() {
  const hasAerial = Boolean(aerialState.results);
  const hasCctv = Boolean(cctvState.results);

  return `
    <header class="header">
      <div class="container header-inner">
        <div class="logo" id="nav-home" style="cursor: pointer;">
          <div class="logo-icon">🛸</div>
          <div class="logo-text">Flyt<span>Base</span></div>
        </div>

        <nav class="header-nav">
          <button class="nav-tab ${currentView === 'HOME' ? 'active' : ''}" id="nav-btn-home">
            <span>🏠</span> <span>Home</span>
          </button>
          <button class="nav-tab ${currentView === 'AERIAL_DASHBOARD' || currentView === 'AERIAL_PROGRESS' ? 'active' : ''}" id="nav-btn-aerial">
            <span>🚁</span> <span>Aerial Analysis</span>
            ${hasAerial ? '<span class="nav-dot dot-green"></span>' : ''}
          </button>
          <button class="nav-tab ${currentView === 'CCTV_RESULTS' || currentView === 'CCTV_PROGRESS' ? 'active' : ''}" id="nav-btn-cctv">
            <span>📹</span> <span>CCTV Plates</span>
            ${hasCctv ? '<span class="nav-dot dot-blue"></span>' : ''}
          </button>
        </nav>

        <div class="header-badge">
          <span class="dot"></span>
          <span>Independent Dual-Engine Architecture</span>
        </div>
      </div>
    </header>
  `;
}

function renderAerialProgress(container) {
  const p = aerialState.progress;
  const pct = p.total > 0 ? Math.min(Math.round((p.processed / p.total) * 100), 100) : 10;

  container.innerHTML = `
    <section class="progress-section animate-in">
      <div class="container progress-card">
        <div class="progress-header">
          <div class="badge-aerial-tag">🛸 AERIAL TRAFFIC PROCESSING</div>
          <h2 class="progress-title">Analyzing Aerial Traffic Footage</h2>
          <p class="progress-subtitle">
            Running tiled VisDrone YOLO11s detection, ByteTrack kinematics, and traffic flow analytics for <strong>${aerialState.filename || 'drone video'}</strong>
          </p>
        </div>

        <div class="progress-bar-track">
          <div class="progress-bar-fill fill-aerial" style="width: ${pct}%;"></div>
        </div>

        <div class="progress-metrics-grid">
          <div class="p-metric">
            <span class="p-label">Processed Frames</span>
            <strong class="p-val mono">${formatNumber(p.processed)} / ${formatNumber(p.total || 0)} (${pct}%)</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Processing Speed</span>
            <strong class="p-val mono">${p.fps ? p.fps + ' fps' : 'Processing...'}</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Estimated Time Left</span>
            <strong class="p-val mono">${p.eta_s ? formatDuration(p.eta_s) : 'Calculating...'}</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Vehicles Tracked</span>
            <strong class="p-val mono text-accent">${formatNumber(p.count || 0)}</strong>
          </div>
        </div>

        <div class="progress-actions">
          <button class="btn btn-outline" id="btn-cancel-aerial">
            <span>✕</span> <span>Cancel & Return</span>
          </button>
        </div>
      </div>
    </section>
  `;

  container.querySelector('#btn-cancel-aerial')?.addEventListener('click', () => {
    if (aerialState.eventSource) aerialState.eventSource.close();
    currentView = 'HOME';
    renderApp();
  });
}

function renderCctvProgress(container) {
  const p = cctvState.progress;
  const pct = p.progress_pct || 15;

  container.innerHTML = `
    <section class="progress-section animate-in">
      <div class="container progress-card card-cctv-accent">
        <div class="progress-header">
          <div class="badge-cctv-tag">📹 CCTV NUMBER PLATE PIPELINE</div>
          <h2 class="progress-title">Extracting CCTV License Plates</h2>
          <p class="progress-subtitle">
            Running vehicle detection, ByteTrack tracking, license plate localization, and multi-frame OCR consensus for <strong>${cctvState.filename || 'CCTV video'}</strong>
          </p>
        </div>

        <div class="progress-bar-track">
          <div class="progress-bar-fill fill-cctv" style="width: ${pct}%;"></div>
        </div>

        <div class="progress-metrics-grid">
          <div class="p-metric">
            <span class="p-label">Progress</span>
            <strong class="p-val mono text-accent">${pct}%</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Frames Processed</span>
            <strong class="p-val mono">${p.processed_frames || 0} / ${p.total_frames || '...'}</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Vehicles Tracked</span>
            <strong class="p-val mono text-accent">${p.vehicles_tracked || 0}</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Pipeline Stage</span>
            <strong class="p-val" style="font-size: 13px;">${p.message || 'Tracking vehicles...'}</strong>
          </div>
        </div>

        <div class="progress-actions">
          <button class="btn btn-outline" id="btn-cancel-cctv">
            <span>✕</span> <span>Cancel & Return</span>
          </button>
        </div>
      </div>
    </section>
  `;

  container.querySelector('#btn-cancel-cctv')?.addEventListener('click', () => {
    if (cctvState.eventSource) cctvState.eventSource.close();
    currentView = 'HOME';
    renderApp();
  });
}

function renderApp() {
  app.innerHTML = renderHeader();

  const mainMount = document.createElement('main');
  mainMount.id = 'main-mount';
  app.appendChild(mainMount);

  // Bind Header Navigation
  const navHome = document.getElementById('nav-home');
  const btnNavHome = document.getElementById('nav-btn-home');
  const btnNavAerial = document.getElementById('nav-btn-aerial');
  const btnNavCctv = document.getElementById('nav-btn-cctv');

  navHome?.addEventListener('click', () => {
    currentView = 'HOME';
    renderApp();
  });

  btnNavHome?.addEventListener('click', () => {
    currentView = 'HOME';
    renderApp();
  });

  btnNavAerial?.addEventListener('click', () => {
    if (aerialState.results) {
      currentView = 'AERIAL_DASHBOARD';
    } else if (aerialState.jobId) {
      currentView = 'AERIAL_PROGRESS';
    } else {
      currentView = 'HOME';
    }
    renderApp();
  });

  btnNavCctv?.addEventListener('click', () => {
    if (cctvState.results) {
      currentView = 'CCTV_RESULTS';
    } else if (cctvState.jobId) {
      currentView = 'CCTV_PROGRESS';
    } else {
      currentView = 'HOME';
    }
    renderApp();
  });

  // Render view
  switch (currentView) {
    case 'HOME':
      renderHome(mainMount, {
        onAerialSelected: handleAerialUpload,
        onCctvSelected: handleCctvUpload,
      });
      break;

    case 'AERIAL_PROGRESS':
      renderAerialProgress(mainMount);
      break;

    case 'AERIAL_DASHBOARD':
      if (aerialState.results) {
        renderDashboard(mainMount, aerialState.results, {
          onNewUpload: () => {
            currentView = 'HOME';
            renderApp();
          },
        });
      } else {
        currentView = 'HOME';
        renderApp();
      }
      break;

    case 'CCTV_PROGRESS':
      renderCctvProgress(mainMount);
      break;

    case 'CCTV_RESULTS':
      if (cctvState.results) {
        renderCctvResults(mainMount, cctvState.results, {
          onNewUpload: () => {
            currentView = 'HOME';
            renderApp();
          },
          onSwitchToAerial: () => {
            currentView = aerialState.results ? 'AERIAL_DASHBOARD' : 'HOME';
            renderApp();
          },
        });
      } else {
        currentView = 'HOME';
        renderApp();
      }
      break;

    default:
      renderHome(mainMount, {
        onAerialSelected: handleAerialUpload,
        onCctvSelected: handleCctvUpload,
      });
  }
}

async function handleAerialUpload(file) {
  if (!file) return;

  aerialState.filename = file.name;
  aerialState.progress = { processed: 0, total: 0, fps: 0, eta_s: 0, count: 0 };
  currentView = 'AERIAL_PROGRESS';
  renderApp();

  try {
    const uploadRes = await uploadVideo(file);
    const jobId = uploadRes.job_id;
    aerialState.jobId = jobId;

    aerialState.eventSource = subscribeProgress(jobId, {
      onProgress: (p) => {
        aerialState.progress = p;
        if (currentView === 'AERIAL_PROGRESS') {
          const mount = document.getElementById('main-mount');
          if (mount) renderAerialProgress(mount);
        }
      },
      onDone: async (finalResult) => {
        try {
          const fullResults = await getResults(jobId);
          aerialState.results = fullResults;
        } catch {
          aerialState.results = { ...finalResult, job_id: jobId, filename: file.name };
        }
        currentView = 'AERIAL_DASHBOARD';
        renderApp();
      },
      onError: (errData) => {
        alert(errData.error || 'Aerial tracking failed.');
        currentView = 'HOME';
        renderApp();
      },
    });
  } catch (err) {
    alert(err.message || 'Failed to upload aerial video');
    currentView = 'HOME';
    renderApp();
  }
}

async function handleCctvUpload(file) {
  if (!file) return;

  cctvState.filename = file.name;
  cctvState.progress = { progress_pct: 10, processed_frames: 0, total_frames: 0, vehicles_tracked: 0, message: 'Uploading video...' };
  currentView = 'CCTV_PROGRESS';
  renderApp();

  try {
    const uploadRes = await uploadCctvVideo(file);
    const jobId = uploadRes.job_id;
    cctvState.jobId = jobId;

    cctvState.eventSource = subscribeCctvProgress(jobId, {
      onProgress: (p) => {
        cctvState.progress = p;
        if (currentView === 'CCTV_PROGRESS') {
          const mount = document.getElementById('main-mount');
          if (mount) renderCctvProgress(mount);
        }
      },
      onDone: async (finalResult) => {
        try {
          const fullResults = await getCctvResults(jobId);
          cctvState.results = fullResults;
        } catch {
          cctvState.results = finalResult;
        }
        currentView = 'CCTV_RESULTS';
        renderApp();
      },
      onError: (errData) => {
        alert(errData.error || 'CCTV analysis failed.');
        currentView = 'HOME';
        renderApp();
      },
    });
  } catch (err) {
    alert(err.message || 'Failed to upload CCTV recording');
    currentView = 'HOME';
    renderApp();
  }
}

// Initial launch
renderApp();
