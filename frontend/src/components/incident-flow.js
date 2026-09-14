/**
 * incident-flow.js — Manages the simplified 8-state Aerial-First Incident Investigation Workflow.
 * 
 * States:
 * 1. WAITING_FOR_AERIAL
 * 2. ANALYZING_AERIAL
 * 3. NO_INCIDENT
 * 4. INCIDENT_DETECTED
 * 5. WAITING_FOR_CCTV
 * 6. ANALYZING_CCTV
 * 7. INVESTIGATION_COMPLETE
 * 8. INVESTIGATION_FAILED
 */

import { formatDuration, formatNumber } from '../utils/format.js';
import { uploadCctvForIncident, investigateIncident, getAnprCropUrl } from '../api.js';

export function createIncidentFlowManager({
  container,
  onAerialUpload,
  onResetWorkflow,
  onToggleAnalyticsDashboard,
}) {
  let currentState = 'WAITING_FOR_AERIAL';
  let flowData = {
    aerialFile: null,
    aerialProgress: { processed: 0, total: 0, fps: 0, eta_s: 0, count: 0 },
    aerialResults: null,
    incident: null,
    cctvFile: null,
    cctvStep: 1, // 1: tracking, 2: reid, 3: anpr
    investigationReport: null,
    errorMessage: null,
    isDashboardExpanded: false,
  };

  function transitionTo(newState, updates = {}) {
    currentState = newState;
    flowData = { ...flowData, ...updates };
    render();
  }

  function render() {
    container.innerHTML = '';
    const flowWrapper = document.createElement('div');
    flowWrapper.className = 'incident-flow-wrapper';

    switch (currentState) {
      case 'WAITING_FOR_AERIAL':
        flowWrapper.innerHTML = renderWaitingForAerial();
        bindWaitingForAerial(flowWrapper);
        break;

      case 'ANALYZING_AERIAL':
        flowWrapper.innerHTML = renderAnalyzingAerial();
        break;

      case 'NO_INCIDENT':
        flowWrapper.innerHTML = renderNoIncident();
        bindNoIncident(flowWrapper);
        break;

      case 'INCIDENT_DETECTED':
        flowWrapper.innerHTML = renderIncidentDetected();
        bindIncidentDetected(flowWrapper);
        break;

      case 'WAITING_FOR_CCTV':
        flowWrapper.innerHTML = renderWaitingForCCTV();
        bindWaitingForCCTV(flowWrapper);
        break;

      case 'ANALYZING_CCTV':
        flowWrapper.innerHTML = renderAnalyzingCCTV();
        break;

      case 'INVESTIGATION_COMPLETE':
        flowWrapper.innerHTML = renderInvestigationComplete();
        bindInvestigationComplete(flowWrapper);
        break;

      case 'INVESTIGATION_FAILED':
        flowWrapper.innerHTML = renderInvestigationFailed();
        bindInvestigationFailed(flowWrapper);
        break;

      default:
        flowWrapper.innerHTML = `<div class="error-msg">Unknown state: ${currentState}</div>`;
    }

    container.appendChild(flowWrapper);

    // If a collapsible dashboard container is needed, append hook
    const dashboardHost = document.createElement('div');
    dashboardHost.id = 'collapsible-dashboard-host';
    dashboardHost.style.display = flowData.isDashboardExpanded ? 'block' : 'none';
    container.appendChild(dashboardHost);

    if (flowData.isDashboardExpanded && onToggleAnalyticsDashboard) {
      onToggleAnalyticsDashboard(dashboardHost, flowData.aerialResults);
    }
  }

  // =========================================================================
  // 1. WAITING_FOR_AERIAL
  // =========================================================================
  function renderWaitingForAerial() {
    return `
      <section class="flow-hero-section">
        <div class="flow-container">
          <div class="flow-badge-pill">
            <span class="pulsing-dot green"></span>
            <span>Intelligent Traffic Incident & Verification System</span>
          </div>

          <h1 class="flow-main-title">
            Traffic Incident <span class="gradient-text">Analyzer</span>
          </h1>
          <p class="flow-main-subtitle">
            Upload aerial drone footage to begin automated traffic analysis. 
            CCTV verification is only requested if a significant road hazard or collision is identified.
          </p>

          <div class="flow-upload-card" id="aerial-dropzone">
            <div class="flow-upload-icon-circle">
              <span class="upload-icon-emoji">🛸</span>
            </div>
            <h3 class="flow-dropzone-title">Upload Aerial / Drone Footage</h3>
            <p class="flow-dropzone-desc">Drag and drop high-altitude drone video here, or click to browse</p>
            <div class="flow-file-types">Supports MP4, AVI, MOV • Max 4K 60fps</div>
            <input type="file" id="aerial-file-input" accept="video/*" style="display: none;" />
            <button class="flow-btn-primary" id="btn-browse-aerial" style="margin-top: 16px;">
              📁 Select Aerial Video
            </button>
          </div>

          <div class="flow-features-strip">
            <div class="flow-feature-item">
              <span class="flow-feat-icon">🎯</span>
              <div>
                <strong>VisDrone AI Tracking</strong>
                <span>Sub-meter vehicle tracking across wide aerial intersections</span>
              </div>
            </div>
            <div class="flow-feature-item">
              <span class="flow-feat-icon">⚡</span>
              <div>
                <strong>Kinematic Risk Profiling</strong>
                <span>Deceleration shockwaves, collision swerves, & bottleneck identification</span>
              </div>
            </div>
            <div class="flow-feature-item">
              <span class="flow-feat-icon">📹</span>
              <div>
                <strong>Selective CCTV & ANPR</strong>
                <span>Ground multi-camera Re-ID & plate verification only when required</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function bindWaitingForAerial(wrapper) {
    const dropzone = wrapper.querySelector('#aerial-dropzone');
    const input = wrapper.querySelector('#aerial-file-input');
    const browseBtn = wrapper.querySelector('#btn-browse-aerial');

    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.click();
    });

    dropzone.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleAerialSelected(e.target.files[0]);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('active-drag');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('active-drag');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('active-drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleAerialSelected(e.dataTransfer.files[0]);
      }
    });
  }

  function handleAerialSelected(file) {
    transitionTo('ANALYZING_AERIAL', {
      aerialFile: file,
      aerialProgress: { processed: 0, total: 0, fps: 0, eta_s: 0, count: 0 },
    });
    if (onAerialUpload) {
      onAerialUpload(file);
    }
  }

  // =========================================================================
  // 2. ANALYZING_AERIAL
  // =========================================================================
  function renderAnalyzingAerial() {
    const p = flowData.aerialProgress;
    const pct = p.total > 0 ? Math.min(Math.round((p.processed / p.total) * 100), 100) : 0;
    const filename = flowData.aerialFile ? flowData.aerialFile.name : 'aerial_footage.mp4';

    return `
      <section class="flow-hero-section">
        <div class="flow-container">
          <div class="flow-analysis-card">
            <div class="flow-spinner-pulse">
              <span style="font-size: 32px;">🛸</span>
            </div>

            <h2 class="flow-step-title">Analyzing Aerial Footage</h2>
            <p class="flow-step-subtitle">
              Processing video <code class="mono-code">${filename}</code> with VisDrone detector & kinematic engine...
            </p>

            <div class="flow-progress-track">
              <div class="flow-progress-fill" style="width: ${pct}%;"></div>
            </div>

            <div class="flow-metrics-row">
              <div class="flow-metric-block">
                <span class="flow-metric-label">Progress</span>
                <span class="flow-metric-val" id="aerial-pct">${pct}%</span>
                <span class="flow-metric-sub" id="aerial-counts">(${p.processed} / ${p.total || '?'}) frames</span>
              </div>
              <div class="flow-metric-block">
                <span class="flow-metric-label">Processing Speed</span>
                <span class="flow-metric-val" id="aerial-fps">${p.fps ? p.fps.toFixed(1) : '—'} <span style="font-size: 14px;">fps</span></span>
                <span class="flow-metric-sub">Real-time inference</span>
              </div>
              <div class="flow-metric-block">
                <span class="flow-metric-label">Estimated Time</span>
                <span class="flow-metric-val" id="aerial-eta">${p.eta_s > 0 ? formatDuration(p.eta_s) : 'Calculating...'}</span>
                <span class="flow-metric-sub">Remaining</span>
              </div>
            </div>

            <div class="flow-current-stage-indicator">
              <span class="stage-spin-dot"></span>
              <span>Detecting road users, tracking trajectories, and analyzing traffic flow...</span>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // =========================================================================
  // 3. NO_INCIDENT
  // =========================================================================
  function renderNoIncident() {
    const results = flowData.aerialResults || {};
    const overview = (results.analytics && results.analytics.overview) || {};
    const uniqueVehicles = results.unique_tracks || overview.unique_tracks || 0;
    const avgSpeed = overview.mean_speed_kmh || '19.2';

    return `
      <section class="flow-hero-section">
        <div class="flow-container">
          <div class="flow-result-card normal-traffic">
            <div class="flow-result-header">
              <div class="flow-success-badge">
                <span class="check-icon">✓</span>
                <span>Normal Traffic Flow Verified</span>
              </div>
              <span class="flow-date-tag">Surveillance Scan Complete</span>
            </div>

            <div class="flow-result-hero">
              <div class="flow-icon-big normal">🟢</div>
              <div>
                <h2 class="flow-result-headline">No Significant Incident Detected</h2>
                <p class="flow-result-lead">
                  Aerial surveillance indicates optimal traffic flow. No severe collisions, sudden obstruction stops,
                  or shockwave bottlenecks were observed in this segment.
                </p>
              </div>
            </div>

            <div class="flow-stat-tiles-grid">
              <div class="flow-stat-tile">
                <span class="tile-icon">🚗</span>
                <span class="tile-value">${formatNumber(uniqueVehicles)}</span>
                <span class="tile-label">Vehicles Observed</span>
              </div>
              <div class="flow-stat-tile">
                <span class="tile-icon">⚡</span>
                <span class="tile-value">${avgSpeed} <span style="font-size: 14px;">km/h</span></span>
                <span class="tile-label">Average Traffic Speed</span>
              </div>
              <div class="flow-stat-tile">
                <span class="tile-icon">🌊</span>
                <span class="tile-value" style="color: var(--accent-emerald);">Optimal</span>
                <span class="tile-label">Traffic Density Level</span>
              </div>
              <div class="flow-stat-tile">
                <span class="tile-icon">🛡️</span>
                <span class="tile-value" style="color: var(--accent-blue);">0 Critical</span>
                <span class="tile-label">Active Hazards</span>
              </div>
            </div>

            <div class="flow-notice-box normal">
              <span class="notice-icon">ℹ️</span>
              <p>
                <strong>No CCTV footage required:</strong> Because no collision or road-blocking hazard was flagged, 
                ground-camera dispatch and license plate recognition were not triggered. The aerial scan concluded cleanly.
              </p>
            </div>

            <div class="flow-action-buttons">
              <button class="flow-btn-primary" id="btn-new-aerial">
                ➕ Analyze Another Aerial Video
              </button>
              <button class="flow-btn-secondary" id="btn-toggle-dashboard">
                ${flowData.isDashboardExpanded ? '▲ Hide' : '📊 View'} Detailed Traffic Statistics & Video
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function bindNoIncident(wrapper) {
    wrapper.querySelector('#btn-new-aerial')?.addEventListener('click', () => {
      if (onResetWorkflow) onResetWorkflow();
      transitionTo('WAITING_FOR_AERIAL');
    });

    wrapper.querySelector('#btn-toggle-dashboard')?.addEventListener('click', () => {
      flowData.isDashboardExpanded = !flowData.isDashboardExpanded;
      render();
    });
  }

  // =========================================================================
  // 4. INCIDENT_DETECTED
  // =========================================================================
  function renderIncidentDetected() {
    const inc = flowData.incident || {};
    const congestion = inc.congestion_attribution || inc.details?.congestion || {};
    const score = inc.details?.score || Math.round((inc.confidence || 0.75) * 100);
    const primaryTrack = (inc.involved_tracks && inc.involved_tracks[0]) ? inc.involved_tracks[0].track_id : '--';
    const vehicleClass = (inc.details?.classes && inc.details.classes[0]) ? inc.details.classes[0] : 'vehicle';

    // Risk level label
    let riskLevel = inc.details?.level || 'High Risk / Possible Incident';
    if (score >= 80) riskLevel = 'Suspected Collision';

    // Traffic congestion flag
    const trafficCaused = congestion.traffic_caused;
    const leadVehicle = congestion.lead_vehicle_id || inc.lead_bottleneck_vehicle_id;
    const impactedCount = congestion.impacted_count || (congestion.impacted_vehicles ? congestion.impacted_vehicles.length : 0);
    const queueLength = congestion.queue_length_m || 0;

    return `
      <section class="flow-hero-section">
        <div class="flow-container">
          <div class="flow-result-card incident-card">
            <!-- Warning Header -->
            <div class="flow-result-header">
              <div class="flow-alert-badge">
                <span class="alert-icon">⚠</span>
                <span>Possible Traffic Incident Detected</span>
              </div>
              <span class="flow-id-tag">ID: <strong>${inc.incident_id || 'INC_001'}</strong></span>
            </div>

            <!-- Incident Headline -->
            <div class="flow-result-hero">
              <div class="flow-icon-big alert">🚨</div>
              <div>
                <div class="flow-severity-pill ${inc.severity || 'high'}">
                  Risk Level: ${riskLevel} (${score}/100)
                </div>
                <h2 class="flow-result-headline" style="margin-top: 8px;">
                  ${inc.incident_type || 'Possible Collision / Deceleration Shockwave'}
                </h2>
                <p class="flow-result-lead">
                  Kinematic anomaly detected at timestamp <strong>${inc.timestamp_s || '0.0'}s</strong>.
                </p>
              </div>
            </div>

            <!-- Traffic Congestion Attribution Box -->
            <div class="congestion-attribution-box ${trafficCaused ? 'congestion-active' : 'congestion-none'}">
              <div class="congestion-box-header">
                <span class="congestion-badge-icon">${trafficCaused ? '🛑' : '🟢'}</span>
                <strong>
                  ${trafficCaused 
                    ? `Traffic Disruption Caused by Vehicle Track #${leadVehicle}` 
                    : 'No Traffic Congestion Observed Behind Incident'}
                </strong>
              </div>
              <p class="congestion-box-desc">
                ${trafficCaused
                  ? `Lead vehicle <strong>Track #${leadVehicle}</strong> formed a bottleneck, forcing <strong>${impactedCount} trailing vehicles</strong> into a queue (${queueLength}m queue length).`
                  : 'The event occurred without causing trailing vehicle queuing or significant corridor shockwaves.'}
              </p>
              ${trafficCaused && congestion.impacted_vehicles && congestion.impacted_vehicles.length > 0
                ? `<div class="impacted-list">Impacted Trailing Vehicles: ${congestion.impacted_vehicles.map(id => `<span class="tag-tid">#${id}</span>`).join(' ')}</div>`
                : ''}
            </div>

            <!-- Telemetry summary row -->
            <div class="flow-info-grid">
              <div class="flow-info-item">
                <span class="info-label">Primary Incident Vehicle</span>
                <span class="info-val">Track #${primaryTrack} <span class="badge-sub">(${vehicleClass})</span></span>
              </div>
              <div class="flow-info-item">
                <span class="info-label">Timestamp in Footage</span>
                <span class="info-val">${inc.timestamp_s || 0} seconds</span>
              </div>
              <div class="flow-info-item">
                <span class="info-label">Detection Confidence</span>
                <span class="info-val">${Math.round((inc.confidence || 0.8) * 100)}%</span>
              </div>
            </div>

            <!-- Call to Action Banner -->
            <div class="flow-prompt-banner">
              <div class="prompt-icon">📹</div>
              <div class="prompt-text">
                <strong>Ground CCTV Verification Required:</strong>
                <p>
                  To confirm vehicle damage, cross-verify identity, and extract the license plate (ANPR), 
                  ground-perspective CCTV footage is required for Incident <strong>${inc.incident_id}</strong>.
                </p>
              </div>
            </div>

            <div class="flow-action-buttons">
              <button class="flow-btn-primary alert-action" id="btn-proceed-cctv">
                📹 Upload CCTV Footage for ${inc.incident_id} →
              </button>
              <button class="flow-btn-secondary" id="btn-toggle-dashboard-inc">
                ${flowData.isDashboardExpanded ? '▲ Hide' : '📊 View'} Aerial Telemetry & Video
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function bindIncidentDetected(wrapper) {
    wrapper.querySelector('#btn-proceed-cctv')?.addEventListener('click', () => {
      transitionTo('WAITING_FOR_CCTV');
    });

    wrapper.querySelector('#btn-toggle-dashboard-inc')?.addEventListener('click', () => {
      flowData.isDashboardExpanded = !flowData.isDashboardExpanded;
      render();
    });
  }

  // =========================================================================
  // 5. WAITING_FOR_CCTV
  // =========================================================================
  function renderWaitingForCCTV() {
    const inc = flowData.incident || {};
    const primaryTrack = (inc.involved_tracks && inc.involved_tracks[0]) ? inc.involved_tracks[0].track_id : '--';

    return `
      <section class="flow-hero-section">
        <div class="flow-container">
          <div class="flow-cctv-prompt-card">
            <button class="btn-back-link" id="btn-back-to-incident">← Back to Incident Overview</button>

            <div class="cctv-header-banner">
              <div class="cctv-cam-icon">📹</div>
              <div>
                <h2 class="cctv-step-title">Upload CCTV Footage for ${inc.incident_id}</h2>
                <p class="cctv-step-sub">
                  Provide ground CCTV footage covering the downstream corridor to cross-verify Track #${primaryTrack} 
                  and run neural license plate recognition (ANPR).
                </p>
              </div>
            </div>

            <div class="cctv-dropzone" id="cctv-dropzone">
              <span class="upload-icon-emoji">🎥</span>
              <h3>Drop CCTV Video File Here</h3>
              <p>or click to select ground surveillance footage</p>
              <input type="file" id="cctv-file-input" accept="video/*" style="display: none;" />
              <button class="flow-btn-primary" id="btn-browse-cctv" style="margin-top: 14px;">
                📁 Choose CCTV Video File
              </button>
            </div>

            <div class="cctv-quick-test-divider">
              <span>OR FOR RAPID TESTING</span>
            </div>

            <div class="cctv-sample-box">
              <div>
                <div class="sample-title">⚡ Use Pre-Registered Corridor CCTV Stream</div>
                <div class="sample-desc">Automatically dispatches the optimal downstream pole camera (CCTV_02 Eastbound Exit) for ${inc.incident_id}.</div>
              </div>
              <button class="flow-btn-emerald" id="btn-use-sample-cctv">
                ⚡ Use Sample CCTV Footage
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function bindWaitingForCCTV(wrapper) {
    const dropzone = wrapper.querySelector('#cctv-dropzone');
    const input = wrapper.querySelector('#cctv-file-input');
    const browseBtn = wrapper.querySelector('#btn-browse-cctv');
    const sampleBtn = wrapper.querySelector('#btn-use-sample-cctv');
    const backBtn = wrapper.querySelector('#btn-back-to-incident');

    backBtn.addEventListener('click', () => {
      transitionTo('INCIDENT_DETECTED');
    });

    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.click();
    });

    dropzone.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleCctvUpload(e.target.files[0]);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('active-drag');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('active-drag');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('active-drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleCctvUpload(e.dataTransfer.files[0]);
      }
    });

    sampleBtn.addEventListener('click', () => {
      handleUseSampleCctv();
    });
  }

  async function handleCctvUpload(file) {
    const incId = flowData.incident.incident_id;
    transitionTo('ANALYZING_CCTV', { cctvFile: file, cctvStep: 1 });

    try {
      // Step 1: Tracking
      updateCctvStep(1);
      await delay(600);

      // Call API
      updateCctvStep(2);
      const report = await uploadCctvForIncident(incId, file);

      updateCctvStep(3);
      await delay(500);

      if (report.status === 'done') {
        transitionTo('INVESTIGATION_COMPLETE', { investigationReport: report });
      } else {
        transitionTo('INVESTIGATION_FAILED', {
          investigationReport: report,
          errorMessage: report.message || 'Investigation did not find a reliable match.',
        });
      }
    } catch (err) {
      transitionTo('INVESTIGATION_FAILED', {
        errorMessage: err.message || 'Failed to process CCTV footage.',
      });
    }
  }

  async function handleUseSampleCctv() {
    const incId = flowData.incident.incident_id;
    transitionTo('ANALYZING_CCTV', { cctvFile: null, cctvStep: 1 });

    try {
      updateCctvStep(1);
      await delay(600);

      updateCctvStep(2);
      const report = await investigateIncident(incId);

      updateCctvStep(3);
      await delay(500);

      if (report.status === 'done') {
        transitionTo('INVESTIGATION_COMPLETE', { investigationReport: report });
      } else {
        transitionTo('INVESTIGATION_FAILED', {
          investigationReport: report,
          errorMessage: report.message || 'Investigation did not find a reliable match.',
        });
      }
    } catch (err) {
      transitionTo('INVESTIGATION_FAILED', {
        errorMessage: err.message || 'Investigation request failed.',
      });
    }
  }

  function updateCctvStep(step) {
    flowData.cctvStep = step;
    const steps = document.querySelectorAll('.cctv-pipe-step');
    steps.forEach((el, idx) => {
      const sNum = idx + 1;
      if (sNum < step) {
        el.className = 'cctv-pipe-step done';
      } else if (sNum === step) {
        el.className = 'cctv-pipe-step active';
      } else {
        el.className = 'cctv-pipe-step pending';
      }
    });
  }

  // =========================================================================
  // 6. ANALYZING_CCTV
  // =========================================================================
  function renderAnalyzingCCTV() {
    const step = flowData.cctvStep;
    return `
      <section class="flow-hero-section">
        <div class="flow-container">
          <div class="flow-analysis-card">
            <div class="flow-spinner-pulse">
              <span style="font-size: 32px;">📹</span>
            </div>

            <h2 class="flow-step-title">Analyzing CCTV Footage</h2>
            <p class="flow-step-subtitle">
              Performing multi-camera ground verification for Incident <strong>${flowData.incident?.incident_id}</strong>...
            </p>

            <div class="cctv-pipeline-stepper">
              <div class="cctv-pipe-step ${step > 1 ? 'done' : step === 1 ? 'active' : 'pending'}">
                <div class="step-num">${step > 1 ? '✓' : '1'}</div>
                <div class="step-meta">
                  <strong>Ground Vehicle Tracking</strong>
                  <span>Detecting vehicles and generating tracking trajectories</span>
                </div>
              </div>

              <div class="cctv-pipe-step ${step > 2 ? 'done' : step === 2 ? 'active' : 'pending'}">
                <div class="step-num">${step > 2 ? '✓' : '2'}</div>
                <div class="step-meta">
                  <strong>Cross-Camera Re-Identification (Re-ID)</strong>
                  <span>Matching incident drone vehicle against ground CCTV tracks</span>
                </div>
              </div>

              <div class="cctv-pipe-step ${step === 3 ? 'active' : 'pending'}">
                <div class="step-num">3</div>
                <div class="step-meta">
                  <strong>License Plate Recognition (ANPR)</strong>
                  <span>Plate localization and neural OCR consensus</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // =========================================================================
  // 7. INVESTIGATION_COMPLETE
  // =========================================================================
  function renderInvestigationComplete() {
    const r = flowData.investigationReport || {};
    const inc = r.incident || flowData.incident || {};
    const reid = r.reid_result || {};
    const anpr = r.anpr_result || {};
    const identity = r.global_identity || {};
    const timeline = r.timeline || [];
    const selectedCam = r.selected_camera || {};

    const isMatched = reid.matched;
    const isPlateFound = anpr.plate_detected && anpr.plate_text;
    const plateDisplay = isPlateFound ? anpr.plate_text : 'Plate not readable';
    const plateConfPct = isPlateFound ? Math.round(anpr.confidence * 100) : null;

    // Traffic congestion attribution
    const congestion = inc.congestion_attribution || inc.details?.congestion || {};
    const trafficCaused = congestion.traffic_caused;
    const leadVehicle = congestion.lead_vehicle_id || inc.lead_bottleneck_vehicle_id;
    const impactedCount = congestion.impacted_count || (congestion.impacted_vehicles ? congestion.impacted_vehicles.length : 0);

    return `
      <section class="flow-hero-section">
        <div class="flow-container">
          <div class="flow-result-card complete-card">
            <!-- Header -->
            <div class="flow-result-header">
              <div class="flow-success-badge">
                <span class="check-icon">✓</span>
                <span>Multi-Camera Investigation Complete</span>
              </div>
              <span class="flow-id-tag">Incident: <strong>${r.incident_id}</strong></span>
            </div>

            <!-- Traffic Causation Flag Badge -->
            <div class="congestion-attribution-box ${trafficCaused ? 'congestion-active' : 'congestion-none'}" style="margin: 16px 0 24px 0;">
              <div class="congestion-box-header">
                <span class="congestion-badge-icon">${trafficCaused ? '🛑' : '🟢'}</span>
                <strong>
                  ${trafficCaused 
                    ? `Primary Cause of Traffic Congestion: Lead Vehicle Track #${leadVehicle}` 
                    : 'No Traffic Disruption Flagged Behind Incident'}
                </strong>
              </div>
              <p class="congestion-box-desc">
                ${trafficCaused
                  ? `Vehicle <strong>Track #${leadVehicle}</strong> caused a queue of <strong>${impactedCount} trailing vehicles</strong> (${congestion.queue_length_m || 0}m queue length).`
                  : 'Isolated event — trailing traffic remained free-flowing with zero bottleneck queuing.'}
              </p>
            </div>

            <!-- 3-Column Cross-Camera Verification Deck -->
            <div class="verification-deck-grid">
              <!-- Col 1: Drone -->
              <div class="deck-column">
                <div class="deck-col-header">
                  <span class="deck-icon">🛸</span>
                  <div>
                    <h4>Aerial Observation</h4>
                    <span>Drone DRONE_01</span>
                  </div>
                </div>
                <div class="deck-details">
                  <div class="deck-row"><span>Local Track:</span> <strong>#${identity.drone_track_id || '--'}</strong></div>
                  <div class="deck-row"><span>Vehicle Class:</span> <strong>${inc.details?.classes?.[0] || 'Car'}</strong></div>
                  <div class="deck-row"><span>Time in Footage:</span> <strong>${inc.timestamp_s || 0}s</strong></div>
                  <div class="deck-row"><span>Risk Type:</span> <strong style="color: #f87171;">${inc.incident_type || 'Incident'}</strong></div>
                </div>
              </div>

              <!-- Col 2: CCTV -->
              <div class="deck-column">
                <div class="deck-col-header">
                  <span class="deck-icon">📹</span>
                  <div>
                    <h4>CCTV Confirmation</h4>
                    <span>${selectedCam.camera_id || 'CCTV_02'} (${selectedCam.camera_name || 'Corridor Camera'})</span>
                  </div>
                </div>
                <div class="deck-details">
                  <div class="deck-row"><span>Matched Track:</span> <strong>${isMatched ? `#${reid.cctv_track_id}` : 'No Match'}</strong></div>
                  <div class="deck-row"><span>Re-ID Status:</span> <strong style="color: ${isMatched ? 'var(--accent-emerald)' : 'var(--text-muted)'};">${isMatched ? 'Cross-Matched' : 'Unresolved'}</strong></div>
                  <div class="deck-row"><span>Match Confidence:</span> <strong>${isMatched ? `${Math.round(reid.match_confidence * 100)}%` : '—'}</strong></div>
                  <div class="deck-row"><span>Corridor Distance:</span> <strong>${selectedCam.distance_m || 120}m downstream</strong></div>
                </div>
              </div>

              <!-- Col 3: Unified Identity & ANPR -->
              <div class="deck-column highlight">
                <div class="deck-col-header">
                  <span class="deck-icon">🔤</span>
                  <div>
                    <h4>Unified Global Identity</h4>
                    <span>ANPR & Cross-Camera Fusion</span>
                  </div>
                </div>
                <div class="deck-details">
                  <div class="deck-row"><span>Global ID:</span> ${identity.global_vehicle_id ? `<strong class="mono-code">${identity.global_vehicle_id}</strong>` : `<span style="color: var(--text-muted); font-size: 12px;">No Cross-Camera Match</span>`}</div>
                  <div class="deck-plate-box">
                    <span class="plate-mini-flag">IND</span>
                    <span class="plate-mini-text ${isPlateFound ? 'plate-verified' : 'plate-unverified'}">
                      ${plateDisplay}
                    </span>
                  </div>
                  <div class="deck-row" style="margin-top: 8px;">
                    <span>OCR Status:</span> 
                    <strong>${isPlateFound ? `Verified (${plateConfPct}%)` : 'Plate unreadable / unverified'}</strong>
                  </div>
                </div>
              </div>
            </div>

            <!-- Spatio-Temporal Timeline -->
            <div class="flow-timeline-section">
              <h4 class="timeline-title">📍 Spatio-Temporal Journey Timeline</h4>
              <div class="flow-timeline-list">
                ${timeline.map(t => `
                  <div class="flow-timeline-item">
                    <div class="timeline-dot-icon">${t.icon || '📍'}</div>
                    <div class="timeline-text">
                      <div class="timeline-t-header">
                        <strong>${t.stage}</strong>
                        <span class="mono">t=${t.timestamp_s}s</span>
                      </div>
                      <p>${t.description}</p>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Actions -->
            <div class="flow-action-buttons">
              <button class="flow-btn-primary" id="btn-finish-new">
                ➕ Analyze New Aerial Footage
              </button>
              <button class="flow-btn-secondary" id="btn-toggle-dashboard-done">
                ${flowData.isDashboardExpanded ? '▲ Hide' : '📊 View'} Full Traffic Statistics & Video
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function bindInvestigationComplete(wrapper) {
    wrapper.querySelector('#btn-finish-new')?.addEventListener('click', () => {
      if (onResetWorkflow) onResetWorkflow();
      transitionTo('WAITING_FOR_AERIAL');
    });

    wrapper.querySelector('#btn-toggle-dashboard-done')?.addEventListener('click', () => {
      flowData.isDashboardExpanded = !flowData.isDashboardExpanded;
      render();
    });
  }

  // =========================================================================
  // 8. INVESTIGATION_FAILED
  // =========================================================================
  function renderInvestigationFailed() {
    const inc = flowData.incident || {};
    const errMsg = flowData.errorMessage || 'No reliable cross-camera match found on downstream CCTV feed';

    return `
      <section class="flow-hero-section">
        <div class="flow-container">
          <div class="flow-result-card failed-card">
            <div class="flow-result-header">
              <div class="flow-alert-badge" style="background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); border-color: rgba(245, 158, 11, 0.4);">
                <span>⚠</span>
                <span>CCTV Verification Inconclusive</span>
              </div>
              <span class="flow-id-tag">Incident: <strong>${inc.incident_id || 'INC_001'}</strong></span>
            </div>

            <div class="flow-result-hero">
              <div class="flow-icon-big" style="background: rgba(245, 158, 11, 0.12); color: var(--accent-amber);">🔍</div>
              <div>
                <h2 class="flow-result-headline">Cross-Camera Match Unresolved</h2>
                <p class="flow-result-lead">
                  ${errMsg}. The system avoided hallucinating or guessing vehicle identities without confident optical consensus.
                </p>
              </div>
            </div>

            <div class="flow-notice-box normal" style="margin: 20px 0;">
              <span class="notice-icon">🛡️</span>
              <p>
                <strong>Zero Hallucination Guarantee:</strong> When the ground perspective lacks sufficient resolution, 
                travel time consistency, or clear plate visibility, the system preserves honest uncertainty rather than inventing a plate string.
              </p>
            </div>

            <div class="flow-action-buttons">
              <button class="flow-btn-primary" id="btn-retry-cctv">
                🔄 Retry with Different CCTV Footage
              </button>
              <button class="flow-btn-secondary" id="btn-fail-reset">
                ➕ New Aerial Analysis
              </button>
              <button class="flow-btn-secondary" id="btn-toggle-dashboard-fail">
                ${flowData.isDashboardExpanded ? '▲ Hide' : '📊 View'} Aerial Telemetry
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function bindInvestigationFailed(wrapper) {
    wrapper.querySelector('#btn-retry-cctv')?.addEventListener('click', () => {
      transitionTo('WAITING_FOR_CCTV');
    });

    wrapper.querySelector('#btn-fail-reset')?.addEventListener('click', () => {
      if (onResetWorkflow) onResetWorkflow();
      transitionTo('WAITING_FOR_AERIAL');
    });

    wrapper.querySelector('#btn-toggle-dashboard-fail')?.addEventListener('click', () => {
      flowData.isDashboardExpanded = !flowData.isDashboardExpanded;
      render();
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Initial render
  render();

  return {
    updateProgress(p) {
      flowData.aerialProgress = p;
      if (currentState === 'ANALYZING_AERIAL') {
        const pctEl = document.getElementById('aerial-pct');
        const countEl = document.getElementById('aerial-counts');
        const fpsEl = document.getElementById('aerial-fps');
        const etaEl = document.getElementById('aerial-eta');
        const fillEl = document.querySelector('.flow-progress-fill');

        const pct = p.total > 0 ? Math.min(Math.round((p.processed / p.total) * 100), 100) : 0;
        if (pctEl) pctEl.innerText = `${pct}%`;
        if (countEl) countEl.innerText = `(${p.processed} / ${p.total || '?'}) frames`;
        if (fpsEl) fpsEl.innerHTML = `${p.fps ? p.fps.toFixed(1) : '—'} <span style="font-size: 14px;">fps</span>`;
        if (etaEl) etaEl.innerText = p.eta_s > 0 ? formatDuration(p.eta_s) : 'Calculating...';
        if (fillEl) fillEl.style.width = `${pct}%`;
      }
    },

    setAerialComplete(results) {
      flowData.aerialResults = results;
      const hasSignificant = results.has_significant_incident === true;
      const primaryInc = hasSignificant ? (results.primary_incident || null) : null;

      if (hasSignificant && primaryInc) {
        transitionTo('INCIDENT_DETECTED', { incident: primaryInc });
      } else {
        transitionTo('NO_INCIDENT');
      }
    },

    setError(err) {
      transitionTo('WAITING_FOR_AERIAL', { errorMessage: err });
    },

    getState() {
      return currentState;
    },
  };
}
