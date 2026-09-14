/**
 * cctv-results.js — Dedicated Results Dashboard for CCTV Number Plate Analysis.
 */

export function renderCctvResults(container, results, { onNewUpload, onSwitchToAerial }) {
  const summary = results.summary || {};
  const vehicles = results.vehicles || [];

  const totalVehicles = summary.vehicles_detected || vehicles.length;
  const readablePlates = summary.readable_plates || vehicles.filter(v => v.is_readable).length;
  const unreadablePlates = summary.unreadable_plates || (totalVehicles - readablePlates);
  const readRate = summary.readability_rate_pct != null ? summary.readability_rate_pct : Math.round((readablePlates / Math.max(totalVehicles, 1)) * 100);

  container.innerHTML = `
    <section class="cctv-results-section animate-in">
      <div class="container">
        <!-- Header -->
        <div class="cctv-header">
          <div>
            <div class="badge-cctv-tag">
              <span>📹 CCTV NUMBER PLATE EXTRACTION</span>
            </div>
            <h1 class="cctv-title">CCTV Analysis Complete</h1>
            <p class="cctv-subtitle">
              Processed <strong>${results.video_filename || 'CCTV Recording'}</strong> • ${summary.total_frames_processed || 0} frames analyzed
            </p>
          </div>
          <div class="cctv-actions">
            <button class="btn btn-secondary" id="btn-cctv-new">
              <span>📹</span> <span>Upload Another CCTV</span>
            </button>
            <button class="btn btn-primary" id="btn-cctv-switch-aerial">
              <span>🛸</span> <span>Aerial Traffic View</span>
            </button>
          </div>
        </div>

        <!-- 4 Summary Metric Cards -->
        <div class="cctv-summary-grid">
          <div class="cctv-metric-card">
            <div class="metric-icon">🚗</div>
            <div class="metric-value">${totalVehicles}</div>
            <div class="metric-label">Vehicles Detected</div>
          </div>
          <div class="cctv-metric-card highlight-success">
            <div class="metric-icon">🟢</div>
            <div class="metric-value">${readablePlates}</div>
            <div class="metric-label">Readable Number Plates</div>
          </div>
          <div class="cctv-metric-card highlight-muted">
            <div class="metric-icon">⚠️</div>
            <div class="metric-value">${unreadablePlates}</div>
            <div class="metric-label">Unreadable / No Plates</div>
          </div>
          <div class="cctv-metric-card">
            <div class="metric-icon">📊</div>
            <div class="metric-value">${readRate}%</div>
            <div class="metric-label">Plate Readability Rate</div>
          </div>
        </div>

        <!-- Vehicles List Header & Filter -->
        <div class="cctv-table-container">
          <div class="cctv-table-header">
            <h2 class="section-title">Detected Vehicle Results</h2>
            <div class="cctv-filter-tabs">
              <button class="filter-tab active" data-filter="all">All (${totalVehicles})</button>
              <button class="filter-tab" data-filter="readable">Readable (${readablePlates})</button>
              <button class="filter-tab" data-filter="unreadable">Unreadable (${unreadablePlates})</button>
            </div>
          </div>

          <!-- Vehicle Cards Grid -->
          <div class="vehicle-results-grid" id="vehicles-grid">
            ${
              vehicles.length === 0
                ? `<div class="empty-state">No vehicles detected in this CCTV recording.</div>`
                : vehicles.map((v, idx) => {
                    const isReadable = v.is_readable && v.plate_text;
                    const statusClass = isReadable ? 'status-readable' : 'status-unreadable';
                    const displayPlate = isReadable ? v.plate_text : 'Not readable';
                    const confLabel = isReadable ? `${v.confidence}%` : '—';

                    return `
                      <div class="vehicle-card animate-in ${statusClass}" data-readable="${isReadable ? 'true' : 'false'}" data-index="${idx}">
                        <div class="vehicle-card-thumb">
                          ${
                            v.vehicle_crop_url
                              ? `<img src="${v.vehicle_crop_url}" alt="${v.vehicle_id}" loading="lazy" />`
                              : `<div class="thumb-placeholder">🚗</div>`
                          }
                          <span class="vehicle-class-tag">${v.class_name || 'Vehicle'}</span>
                        </div>

                        <div class="vehicle-card-content">
                          <div class="vehicle-id-row">
                            <span class="v-id">${v.vehicle_id}</span>
                            <span class="v-time mono">${v.best_timestamp_s}s</span>
                          </div>

                          <div class="plate-box-row">
                            ${
                              isReadable
                                ? `
                                  <div class="indian-plate-badge">
                                    <span class="plate-country">IND</span>
                                    <span class="plate-text mono">${v.plate_text}</span>
                                  </div>
                                `
                                : `
                                  <div class="plate-unreadable-badge">
                                    <span>${v.plate_status || 'Not readable'}</span>
                                  </div>
                                `
                            }
                          </div>

                          <div class="vehicle-meta-row">
                            <span class="meta-label">Confidence:</span>
                            <strong class="mono ${isReadable ? 'conf-high' : 'conf-low'}">${confLabel}</strong>
                          </div>

                          <div class="vehicle-reason-row">
                            <span class="reason-text" title="${v.reason || ''}">
                              ${v.reason || (isReadable ? 'Plate verified' : 'Unreadable')}
                            </span>
                          </div>

                          <button class="btn btn-outline btn-sm btn-inspect-vehicle" data-index="${idx}">
                            <span>🔍</span> <span>Inspect Plate Frame</span>
                          </button>
                        </div>
                      </div>
                    `;
                  }).join('')
            }
          </div>
        </div>
      </div>
    </section>

    <!-- Modal for Vehicle Inspection -->
    <div class="cctv-modal-overlay" id="inspection-modal" style="display: none;">
      <div class="cctv-modal-card">
        <div class="cctv-modal-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="modal-icon">🔍</span>
            <h3 class="modal-title" id="modal-vehicle-title">Vehicle Inspection</h3>
          </div>
          <button class="btn-modal-close" id="btn-modal-close">✕</button>
        </div>

        <div class="cctv-modal-body" id="modal-body-content">
          <!-- Populated dynamically on click -->
        </div>
      </div>
    </div>
  `;

  // Bind new upload buttons
  container.querySelector('#btn-cctv-new')?.addEventListener('click', () => {
    onNewUpload?.();
  });

  container.querySelector('#btn-cctv-switch-aerial')?.addEventListener('click', () => {
    onSwitchToAerial?.();
  });

  // Filter tabs logic
  const filterTabs = container.querySelectorAll('.filter-tab');
  const vehicleCards = container.querySelectorAll('.vehicle-card');

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const filter = tab.getAttribute('data-filter');

      vehicleCards.forEach(card => {
        const isReadable = card.getAttribute('data-readable') === 'true';
        if (filter === 'all') {
          card.style.display = 'flex';
        } else if (filter === 'readable') {
          card.style.display = isReadable ? 'flex' : 'none';
        } else if (filter === 'unreadable') {
          card.style.display = !isReadable ? 'flex' : 'none';
        }
      });
    });
  });

  // Modal inspection logic
  const modal = container.querySelector('#inspection-modal');
  const modalBody = container.querySelector('#modal-body-content');
  const modalTitle = container.querySelector('#modal-vehicle-title');
  const btnClose = container.querySelector('#btn-modal-close');

  function closeModal() {
    modal.style.display = 'none';
  }

  btnClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  container.querySelectorAll('.btn-inspect-vehicle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      const veh = vehicles[idx];
      if (!veh) return;

      modalTitle.textContent = `${veh.vehicle_id} (${veh.class_name}) Inspection`;

      modalBody.innerHTML = `
        <div class="modal-grid-two-col">
          <!-- Left: Images -->
          <div class="modal-crops-deck">
            <div class="crop-viewer-card">
              <span class="crop-tag">VEHICLE BOUNDING BOX CROP</span>
              <div class="crop-img-wrap">
                ${
                  veh.vehicle_crop_url
                    ? `<img src="${veh.vehicle_crop_url}" alt="Vehicle Crop" />`
                    : `<div class="no-crop">No vehicle crop image</div>`
                }
              </div>
            </div>

            <div class="crop-viewer-card">
              <span class="crop-tag">EXTRACTED LICENSE PLATE CROP</span>
              <div class="crop-img-wrap plate-zoom">
                ${
                  veh.plate_crop_url
                    ? `<img src="${veh.plate_crop_url}" alt="Plate Crop" />`
                    : `<div class="no-crop">No plate crop isolated</div>`
                }
              </div>
            </div>
          </div>

          <!-- Right: Details & Multi-Frame Consensus -->
          <div class="modal-details-deck">
            <div class="modal-result-header">
              ${
                veh.is_readable && veh.plate_text
                  ? `
                    <div class="indian-plate-badge large">
                      <span class="plate-country">IND</span>
                      <span class="plate-text mono">${veh.plate_text}</span>
                    </div>
                    <div class="conf-pill high">Confidence: ${veh.confidence}%</div>
                  `
                  : `
                    <div class="plate-unreadable-badge large">
                      <span>${veh.plate_status || 'Not readable'}</span>
                    </div>
                    <div class="conf-pill low">${veh.reason || 'Unreadable'}</div>
                  `
              }
            </div>

            <div class="modal-props-table">
              <div class="prop-row">
                <span class="p-label">Detected Class:</span>
                <span class="p-val"><strong>${veh.class_name}</strong></span>
              </div>
              <div class="prop-row">
                <span class="p-label">Detection Frame:</span>
                <span class="p-val mono">Frame #${veh.best_frame_idx} (t = ${veh.best_timestamp_s}s)</span>
              </div>
              <div class="prop-row">
                <span class="p-label">Track Duration:</span>
                <span class="p-val mono">${veh.duration_s}s (${veh.detections_count} points)</span>
              </div>
              <div class="prop-row">
                <span class="p-label">Consensus Agreement:</span>
                <span class="p-val mono">${veh.consensus_agreement || 'Single frame inspection'}</span>
              </div>
              <div class="prop-row">
                <span class="p-label">Explanation:</span>
                <span class="p-val">${veh.reason || 'Sufficient plate resolution and character clarity verified.'}</span>
              </div>
            </div>

            <!-- Frame-by-Frame Evaluations Table -->
            <div class="frame-evals-section">
              <h4 class="evals-title">Multi-Frame Candidate Evaluations</h4>
              ${
                veh.frame_evaluations && veh.frame_evaluations.length > 0
                  ? `
                    <div class="evals-table-wrapper">
                      <table class="evals-table">
                        <thead>
                          <tr>
                            <th>Frame</th>
                            <th>Time</th>
                            <th>Sharpness</th>
                            <th>OCR Text</th>
                            <th>Conf</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${veh.frame_evaluations.map(ev => `
                            <tr>
                              <td class="mono">#${ev.frame_idx}</td>
                              <td class="mono">${ev.timestamp_s}s</td>
                              <td class="mono">${ev.sharpness}</td>
                              <td class="mono font-bold">${ev.detected_text || '<span style="color: #94a3b8;">none</span>'}</td>
                              <td class="mono">${ev.confidence > 0 ? ev.confidence + '%' : '—'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  `
                  : `<p style="font-size: 12px; color: var(--text-muted);">No candidate plate frames qualified for OCR.</p>`
              }
            </div>
          </div>
        </div>
      `;

      modal.style.display = 'flex';
    });
  });
}
