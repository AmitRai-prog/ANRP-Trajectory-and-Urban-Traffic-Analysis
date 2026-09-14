/**
 * incident-modal.js — Deep-dive Incident Investigation Modal & Multi-Camera Journey Timeline.
 */

import { investigateIncident } from '../api.js';

export function openIncidentModal(incident, onInvestigated = null) {
  // Remove any existing modal
  const existing = document.getElementById('incident-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'incident-modal-overlay';
  overlay.className = 'incident-modal-overlay animate-fade-in';

  overlay.innerHTML = `
    <div class="incident-modal-card animate-scale-in">
      <!-- Modal Header -->
      <div class="incident-modal-header">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="incident-badge-severity ${incident.severity || 'high'}">
            ${(incident.severity || 'high').toUpperCase()}
          </span>
          <div>
            <h2 class="incident-modal-title">Incident ${incident.incident_id}</h2>
            <p style="color: var(--text-muted); font-size: 13px; margin: 2px 0 0 0;">
              ${incident.incident_type} • Timestamp: <span class="mono">${incident.timestamp_s}s</span>
            </p>
          </div>
        </div>
        <button class="btn-close-modal" id="btn-close-incident-modal">✕</button>
      </div>

      <!-- Investigation Content Body -->
      <div class="incident-modal-body" id="incident-modal-body">
        <div style="text-align: center; padding: 40px;">
          <div class="processing-spinner" style="margin: 0 auto 16px;"></div>
          <h3 style="font-size: 18px; margin-bottom: 8px;">Investigating Incident Across Camera Network</h3>
          <p style="color: var(--text-muted); font-size: 14px; max-width: 480px; margin: 0 auto;">
            Analyzing drone kinematics, selecting downstream CCTV cameras, running vehicle tracking, Re-ID matching, and multi-frame ANPR...
          </p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const btnClose = overlay.querySelector('#btn-close-incident-modal');
  btnClose.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Automatically trigger investigation
  loadInvestigation(incident.incident_id, overlay, onInvestigated);
}

async function loadInvestigation(incidentId, overlay, onInvestigated) {
  const body = overlay.querySelector('#incident-modal-body');
  try {
    const report = await investigateIncident(incidentId);
    renderInvestigationReport(body, report);
    if (onInvestigated) onInvestigated(report);
  } catch (err) {
    body.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
        <h3 style="font-size: 18px; color: #ef4444; margin-bottom: 8px;">Investigation Error</h3>
        <p style="color: var(--text-muted); font-size: 14px; max-width: 400px; margin: 0 auto 20px;">
          ${err.message || 'Failed to complete multi-camera investigation.'}
        </p>
        <button class="btn btn-outline" id="btn-retry-investigation">Retry Investigation</button>
      </div>
    `;
    const retryBtn = body.querySelector('#btn-retry-investigation');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => loadInvestigation(incidentId, overlay, onInvestigated));
    }
  }
}

function renderInvestigationReport(container, report) {
  const inc = report.incident || {};
  const reid = report.reid_result || {};
  const anpr = report.anpr_result || {};
  const globalId = report.global_identity || {};
  const selCam = report.selected_camera || {};
  const candidates = report.candidate_cameras || [];
  const timeline = report.timeline || [];

  const involvedTids = (inc.involved_tracks || []).map(t => `#${t.track_id}`).join(', ') || '#1';
  const matchPct = reid.match_confidence ? Math.round(reid.match_confidence * 100) : 0;
  const reidMatched = reid.matched;

  container.innerHTML = `
    <!-- Top 3 Grid: Drone Observation | Selected CCTV & Re-ID | ANPR & Identity -->
    <div class="investigation-grid">
      <!-- 1. DRONE EVIDENCE CARD -->
      <div class="investigation-card">
        <div class="card-tag">🛸 Primary Drone Observation</div>
        <h3 class="card-heading">Aerial Telemetry & Kinematics</h3>
        
        <div class="meta-row">
          <span class="meta-label">Camera:</span>
          <span class="meta-value">${inc.camera_id} (Aerial 70m)</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Involved Tracks:</span>
          <span class="meta-value mono" style="color: var(--accent-blue); font-weight: 700;">${involvedTids}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Anomaly Signal:</span>
          <span class="meta-value" style="color: #f43f5e; font-weight: 600;">${inc.incident_type}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Confidence:</span>
          <span class="meta-value">${Math.round((inc.confidence || 0.8) * 100)}%</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Timestamp:</span>
          <span class="meta-value mono">${inc.timestamp_s}s</span>
        </div>

        <div class="kinematic-alert-box">
          <div style="font-size: 12px; font-weight: 700; color: #f43f5e; margin-bottom: 4px;">
            ⚠️ KINEMATIC EVENT TRIGGER
          </div>
          <div style="font-size: 13px; color: var(--text-primary);">
            Rapid speed drop along heading corridor. Vehicle slowed abruptly and triggered spatial proximity alert.
          </div>
        </div>
      </div>

      <!-- 2. CCTV MATCH & RE-ID CARD -->
      <div class="investigation-card">
        <div class="card-tag">📹 CCTV Hand-off & Re-ID</div>
        <h3 class="card-heading">${selCam.camera_name || 'CCTV Camera'}</h3>

        <div class="meta-row">
          <span class="meta-label">Distance from Event:</span>
          <span class="meta-value mono">${selCam.distance_m || 120}m downstream</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">CCTV Local Track:</span>
          <span class="meta-value mono" style="color: var(--accent-emerald); font-weight: 700;">
            ${reid.cctv_track_id ? `#${reid.cctv_track_id}` : 'None'} 
            <small style="font-size: 11px; color: var(--text-muted); font-weight: 400;">(Local CCTV ID)</small>
          </span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Re-ID Match:</span>
          <span class="meta-value" style="color: ${reidMatched ? 'var(--accent-emerald)' : '#f59e0b'}; font-weight: 700;">
            ${reidMatched ? `MATCH VERIFIED (${matchPct}%)` : 'NO RELIABLE MATCH'}
          </span>
        </div>

        <!-- Similarity breakdown -->
        ${reid.breakdown ? `
          <div style="margin-top: 12px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px; font-weight: 600;">MULTI-MODAL SIMILARITY BREAKDOWN</div>
            <div class="score-bar-row">
              <span style="font-size: 11px;">Visual HSV</span>
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width: ${reid.breakdown.visual_similarity * 100}%;"></div></div>
              <span class="mono" style="font-size: 11px;">${reid.breakdown.visual_similarity}</span>
            </div>
            <div class="score-bar-row">
              <span style="font-size: 11px;">Class Match</span>
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width: ${reid.breakdown.class_similarity * 100}%;"></div></div>
              <span class="mono" style="font-size: 11px;">${reid.breakdown.class_similarity}</span>
            </div>
            <div class="score-bar-row">
              <span style="font-size: 11px;">Travel Window</span>
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width: ${reid.breakdown.temporal_similarity * 100}%;"></div></div>
              <span class="mono" style="font-size: 11px;">${reid.breakdown.temporal_similarity}</span>
            </div>
          </div>
        ` : `
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 12px;">${reid.reason || 'No match detected'}</div>
        `}
      </div>

      <!-- 3. ANPR & GLOBAL VEHICLE IDENTITY -->
      <div class="investigation-card">
        <div class="card-tag">🔤 ANPR & Global Identity</div>
        <h3 class="card-heading">Vehicle Verified Identity</h3>

        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 12px; margin-bottom: 14px; text-align: center;">
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Global Vehicle ID</div>
          <div class="mono" style="font-size: 20px; font-weight: 800; color: var(--accent-emerald); margin: 4px 0;">
            ${globalId.global_vehicle_id || 'UNRESOLVED'}
          </div>
          <div style="font-size: 12px; color: var(--text-muted);">
            Links Drone <strong style="color: var(--accent-blue);">#${globalId.drone_track_id || '--'}</strong> ↔ CCTV <strong style="color: var(--accent-emerald);">#${globalId.cctv_track_id || '--'}</strong>
          </div>
        </div>

        <div class="meta-row">
          <span class="meta-label">License Plate:</span>
          <span class="meta-value">
            ${anpr.plate_detected ? `
              <span class="license-plate-tag">${anpr.plate_text}</span>
            ` : `<span style="color: #f59e0b;">Plate Unreadable</span>`}
          </span>
        </div>
        <div class="meta-row">
          <span class="meta-label">OCR Confidence:</span>
          <span class="meta-value">${anpr.confidence ? `${Math.round(anpr.confidence * 100)}%` : '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Consensus:</span>
          <span class="meta-value">${anpr.consensus_agreement || 'Single-frame'}</span>
        </div>
        
        <div style="margin-top: 14px; padding: 8px 12px; background: rgba(56, 189, 248, 0.06); border-radius: 6px; border-left: 3px solid var(--accent-blue); font-size: 11px; color: var(--text-muted);">
          🔒 <strong>Privacy Retention Active:</strong> License plates are logged under automated 24-hour retention controls in prototype compliance mode.
        </div>
      </div>
    </div>

    <!-- Middle: Schematic City Camera Network Map -->
    <div style="margin-top: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h4 style="font-size: 15px; font-weight: 700; margin: 0;">🗺️ Pune Arterial Multi-Camera Schematic Map</h4>
        <span style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">
          Intersection: 18.5662° N, 73.7718° E
        </span>
      </div>

      <div class="schematic-map-container">
        <svg viewBox="0 0 800 280" class="schematic-svg">
          <!-- Road Corridors -->
          <!-- Main Diagonal Arterial -->
          <line x1="50" y1="240" x2="750" y2="40" stroke="#334155" stroke-width="48" stroke-linecap="round" />
          <line x1="50" y1="240" x2="750" y2="40" stroke="#1e293b" stroke-width="44" stroke-linecap="round" />
          <line x1="50" y1="240" x2="750" y2="40" stroke="#64748b" stroke-width="2" stroke-dasharray="8 8" />

          <!-- Cross Secondary Street -->
          <line x1="400" y1="20" x2="400" y2="260" stroke="#334155" stroke-width="36" stroke-linecap="round" />
          <line x1="400" y1="20" x2="400" y2="260" stroke="#1e293b" stroke-width="32" stroke-linecap="round" />
          <line x1="400" y1="20" x2="400" y2="260" stroke="#64748b" stroke-width="2" stroke-dasharray="6 6" />

          <!-- Drone Coverage Ellipse -->
          <ellipse cx="400" cy="140" rx="280" ry="110" fill="rgba(56, 189, 248, 0.05)" stroke="rgba(56, 189, 248, 0.3)" stroke-width="1.5" stroke-dasharray="4 4" />
          <text x="400" y="240" text-anchor="middle" fill="var(--accent-blue)" font-size="11" font-family="sans-serif">🛸 DRONE_01 (70m Altitude Coverage)</text>

          <!-- Vehicle Hand-off Trajectory Path (Animated arrow) -->
          <path d="M 360 150 L 590 85" fill="none" stroke="#10b981" stroke-width="3" stroke-dasharray="6 4" class="animated-dash" />

          <!-- Incident Location Node -->
          <circle cx="360" cy="150" r="14" fill="rgba(244, 63, 94, 0.2)" stroke="#f43f5e" stroke-width="2" />
          <circle cx="360" cy="150" r="6" fill="#f43f5e" />
          <text x="360" y="180" text-anchor="middle" fill="#f43f5e" font-size="11" font-weight="700">🚨 INCIDENT</text>

          <!-- CCTV Cameras -->
          <!-- CCTV_01 (West) -->
          <circle cx="160" cy="205" r="8" fill="#38bdf8" />
          <text x="160" y="228" text-anchor="middle" fill="#94a3b8" font-size="11">CCTV_01</text>

          <!-- CCTV_02 (East Exit - SELECTED) -->
          <circle cx="600" cy="80" r="18" fill="rgba(16, 185, 129, 0.25)" stroke="#10b981" stroke-width="2" />
          <circle cx="600" cy="80" r="9" fill="#10b981" />
          <text x="600" y="52" text-anchor="middle" fill="#10b981" font-size="12" font-weight="800">📹 CCTV_02 (MATCHED)</text>

          <!-- CCTV_03 (North) -->
          <circle cx="400" cy="50" r="8" fill="#38bdf8" />
          <text x="400" y="38" text-anchor="middle" fill="#94a3b8" font-size="11">CCTV_03</text>
        </svg>
      </div>
    </div>

    <!-- Bottom: Spatio-Temporal Journey Narrative Timeline -->
    <div style="margin-top: 24px;">
      <h4 style="font-size: 15px; font-weight: 700; margin-bottom: 16px;">⏱️ Global Vehicle Journey Timeline</h4>
      <div class="investigation-timeline">
        ${timeline.map(step => `
          <div class="timeline-step">
            <div class="timeline-icon">${step.icon || '📍'}</div>
            <div class="timeline-content">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 700; font-size: 14px; color: var(--text-primary);">${step.stage}</div>
                <div class="mono" style="font-size: 12px; color: var(--accent-blue);">${step.timestamp_s}s</div>
              </div>
              <p style="color: var(--text-muted); font-size: 13px; margin: 4px 0 0 0;">
                ${step.description}
              </p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
