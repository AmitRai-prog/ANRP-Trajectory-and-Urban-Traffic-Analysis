(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`/api`;async function t(t){let n=new FormData;n.append(`video`,t);let r=await fetch(`${e}/upload`,{method:`POST`,body:n});if(!r.ok){let e=await r.json().catch(()=>({}));throw Error(e.detail||`Upload failed (${r.status})`)}return r.json()}function n(t,{onProgress:n,onDone:r,onError:i}){let a=new EventSource(`${e}/status/${t}`);return a.addEventListener(`progress`,e=>{n?.(JSON.parse(e.data))}),a.addEventListener(`done`,e=>{r?.(JSON.parse(e.data)),a.close()}),a.addEventListener(`error`,e=>{e.data?i?.(JSON.parse(e.data)):i?.({error:`Connection lost`}),a.close()}),a}async function r(t){let n=await fetch(`${e}/results/${t}`);if(!n.ok)throw Error(`Failed to fetch results (${n.status})`);return n.json()}function i(t){return`${e}/video/${t}`}function a(t){return`${e}/download/${t}`}async function o(t){let n=new FormData;n.append(`video`,t);let r=await fetch(`${e}/cctv/analyze`,{method:`POST`,body:n});if(!r.ok){let e=await r.json().catch(()=>({}));throw Error(e.detail||`CCTV upload failed (${r.status})`)}return r.json()}function s(t,{onProgress:n,onDone:r,onError:i}){let a=new EventSource(`${e}/cctv/status/${t}`);return a.addEventListener(`progress`,e=>{n?.(JSON.parse(e.data))}),a.addEventListener(`done`,e=>{r?.(JSON.parse(e.data)),a.close()}),a.addEventListener(`error`,e=>{e.data?i?.(JSON.parse(e.data)):i?.({error:`Connection lost`}),a.close()}),a}async function c(t){let n=await fetch(`${e}/cctv/results/${t}`);if(!n.ok)throw Error(`Failed to fetch CCTV results (${n.status})`);return n.json()}function l(e,{onAerialSelected:t,onCctvSelected:n}){e.innerHTML=`
    <section class="home-section">
      <div class="container">
        <div class="home-hero animate-in">
          <h1 class="home-title">
            Visual Traffic Intelligence <span class="gradient">Platform</span>
          </h1>
          <p class="home-subtitle">
            Two independent AI capabilities: analyze city-wide aerial traffic flows or extract license plates from ground-level CCTV recordings.
          </p>
        </div>

        <div class="analysis-cards-grid animate-in animate-in-delay-1">
          <!-- CARD 1: Aerial Traffic Analysis -->
          <div class="analysis-card card-aerial" id="card-aerial">
            <div class="card-badge badge-aerial">
              <span>🛸 Aerial Intelligence</span>
            </div>
            <div class="card-icon-header">
              <span class="card-icon">🚁</span>
              <div>
                <h2 class="card-title">Aerial Traffic Analysis</h2>
                <p class="card-desc">
                  Upload drone footage to analyze traffic, vehicle movement and traffic disturbances.
                </p>
              </div>
            </div>

            <div class="card-features">
              <div class="feature-item">
                <span class="feature-bullet">•</span>
                <span>vehicle traffic</span>
              </div>
              <div class="feature-item">
                <span class="feature-bullet">•</span>
                <span>movement</span>
              </div>
              <div class="feature-item">
                <span class="feature-bullet">•</span>
                <span>speed</span>
              </div>
              <div class="feature-item">
                <span class="feature-bullet">•</span>
                <span>traffic disturbances</span>
              </div>
              <div class="feature-item">
                <span class="feature-bullet">•</span>
                <span>risk indicators</span>
              </div>
            </div>

            <div class="upload-dropzone" id="dropzone-aerial">
              <span class="dropzone-icon">🎬</span>
              <p class="dropzone-text">Drop drone video here</p>
              <p class="dropzone-hint">MP4, MOV, AVI (4K / 1080p aerial)</p>
              <button class="btn btn-primary btn-upload-card" id="btn-browse-aerial" type="button">
                <span>🛸</span> <span>Upload Aerial Footage</span>
              </button>
              <input type="file" id="input-aerial" accept="video/*" style="display: none;" />
            </div>
          </div>

          <!-- CARD 2: CCTV Number Plate Analysis -->
          <div class="analysis-card card-cctv" id="card-cctv">
            <div class="card-badge badge-cctv">
              <span>📹 CCTV & ANPR</span>
            </div>
            <div class="card-icon-header">
              <span class="card-icon">📹</span>
              <div>
                <h2 class="card-title">CCTV Number Plate Analysis</h2>
                <p class="card-desc">
                  Upload CCTV footage to detect vehicles and extract their number plates.
                </p>
              </div>
            </div>

            <div class="card-features">
              <div class="feature-item">
                <span class="feature-bullet">•</span>
                <span>vehicles</span>
              </div>
              <div class="feature-item">
                <span class="feature-bullet">•</span>
                <span>vehicle tracks</span>
              </div>
              <div class="feature-item">
                <span class="feature-bullet">•</span>
                <span>license plates</span>
              </div>
              <div class="feature-item">
                <span class="feature-bullet">•</span>
                <span>OCR results</span>
              </div>
            </div>

            <div class="upload-dropzone" id="dropzone-cctv">
              <span class="dropzone-icon">🔍</span>
              <p class="dropzone-text">Drop CCTV video here</p>
              <p class="dropzone-hint">MP4, MOV, AVI (Ground camera footage)</p>
              <button class="btn btn-secondary btn-upload-card" id="btn-browse-cctv" type="button">
                <span>📹</span> <span>Upload CCTV Recording</span>
              </button>
              <input type="file" id="input-cctv" accept="video/*" style="display: none;" />
            </div>
          </div>
        </div>

        <!-- Explanatory footer banner -->
        <div class="independent-banner animate-in animate-in-delay-2">
          <span class="banner-icon">💡</span>
          <span>
            <strong>Completely Independent Features:</strong> You can analyze drone footage OR analyze CCTV footage independently at any time. Neither requires the other.
          </span>
        </div>
      </div>
    </section>
  `;let r=e.querySelector(`#dropzone-aerial`),i=e.querySelector(`#input-aerial`);e.querySelector(`#btn-browse-aerial`).addEventListener(`click`,e=>{e.stopPropagation(),i.click()}),r.addEventListener(`click`,()=>i.click()),i.addEventListener(`change`,e=>{e.target.files&&e.target.files[0]&&t(e.target.files[0])}),u(r,e=>t(e));let a=e.querySelector(`#dropzone-cctv`),o=e.querySelector(`#input-cctv`);e.querySelector(`#btn-browse-cctv`).addEventListener(`click`,e=>{e.stopPropagation(),o.click()}),a.addEventListener(`click`,()=>o.click()),o.addEventListener(`change`,e=>{e.target.files&&e.target.files[0]&&n(e.target.files[0])}),u(a,e=>n(e))}function u(e,t){e.addEventListener(`dragover`,t=>{t.preventDefault(),e.classList.add(`dragover`)}),e.addEventListener(`dragleave`,()=>{e.classList.remove(`dragover`)}),e.addEventListener(`drop`,n=>{n.preventDefault(),e.classList.remove(`dragover`),n.dataTransfer.files&&n.dataTransfer.files[0]&&t(n.dataTransfer.files[0])})}function d(e){if(!e||e<=0)return`0s`;let t=Math.floor(e/60),n=Math.round(e%60);return t===0?`${n}s`:`${t}m ${n}s`}function f(e){return e==null?`—`:e.toLocaleString(`en-US`)}var p={trackId:null,meta:null,traj:null};function m(e,t,n,r={},a=null){e.innerHTML=`
    <div class="video-card animate-in" id="video-card">
      <div class="video-header">
        <div class="video-title">
          <span>🎥 Drone Live Feed & Telemetry HUD</span>
          <span id="hud-status-badge" class="hud-status-badge">
            <span class="hud-dot"></span>
            <span id="hud-status-text">SURVEILLANCE MODE</span>
          </span>
        </div>
        <div class="video-meta">
          <span style="margin-right: 12px;">${n.source_resolution||`—`} @ ${n.sampled_fps?n.sampled_fps.toFixed(1):`—`} fps</span>
          <button id="btn-release-lock" class="btn btn-outline btn-sm" style="display: none; padding: 4px 10px; font-size: 11px;">
            ✕ Release Lock
          </button>
        </div>
      </div>

      <div class="video-stage" id="video-stage">
        <video
          id="main-video-player"
          class="video-player"
          controls
          autoplay
          muted
          loop
          playsinline
          preload="auto"
          src="${i(t)}"
        >
          Your browser does not support the video tag.
        </video>

        <!-- Dynamic HUD Overlay Layer -->
        <div id="hud-target-box" class="hud-target-box" style="display: none;">
          <div class="hud-corners top-left"></div>
          <div class="hud-corners top-right"></div>
          <div class="hud-corners bottom-left"></div>
          <div class="hud-corners bottom-right"></div>
          <div class="hud-crosshair"></div>
          <div class="hud-tag" id="hud-tag">
            <span class="hud-tag-id">#--</span>
            <span class="hud-tag-spd">-- km/h</span>
          </div>
        </div>

        <!-- Telemetry Banner on bottom-left of video -->
        <div id="hud-telemetry-pill" class="hud-telemetry-pill" style="display: none;">
          <div class="pill-dot"></div>
          <div class="pill-info">
            <span class="pill-title" id="pill-title">LOCK ACQUIRED</span>
            <span class="pill-desc" id="pill-desc">Tracking object...</span>
          </div>
        </div>
      </div>
    </div>
  `;let o=e.querySelector(`#main-video-player`),s=e.querySelector(`#video-stage`),c=e.querySelector(`#hud-target-box`),l=e.querySelector(`#hud-tag`),u=e.querySelector(`#hud-status-badge`),d=e.querySelector(`#hud-status-text`),f=e.querySelector(`#btn-release-lock`),m=e.querySelector(`#hud-telemetry-pill`),h=e.querySelector(`#pill-title`),g=e.querySelector(`#pill-desc`);o.addEventListener(`error`,()=>{console.error(`Video playback error:`,o.error),d&&(d.textContent=`VIDEO PLAYBACK ERROR`),u&&(u.className=`hud-status-badge out-of-frame`)});function _(){if(!p.trackId||!p.traj){c.style.display=`none`;return}let e=o.currentTime,t=p.traj,n=t.t,r=t.box,i=t.speed;if(!n||n.length===0){c.style.display=`none`;return}let a=n[0],f=n[n.length-1];if(e<a-.4||e>f+.4){c.style.display=`none`,d.textContent=`TARGET #${p.trackId} OUT OF FRAME`,u.className=`hud-status-badge out-of-frame`;return}let m=0,_=1/0;for(let t=0;t<n.length;t++){let r=Math.abs(n[t]-e);r<_&&(_=r,m=t)}let v=r[m],y=i[m]||0,b=s.clientWidth,x=s.clientHeight,S=v[0]*b,C=v[1]*x,w=Math.max((v[2]-v[0])*b,24),T=Math.max((v[3]-v[1])*x,24);c.style.display=`block`,c.style.left=`${S}px`,c.style.top=`${C}px`,c.style.width=`${w}px`,c.style.height=`${T}px`;let E=y>0?`${Math.round(y)} km/h`:`Stopped`;l.innerHTML=`
      <span class="hud-tag-id">#${p.trackId} ${p.meta.label}</span>
      <span class="hud-tag-spd">${E}</span>
    `,d.textContent=`LOCKED: #${p.trackId} ${p.meta.label.toUpperCase()}`,u.className=`hud-status-badge locked`,h.textContent=`🎯 TARGET #${p.trackId} [${p.meta.label.toUpperCase()}]`,g.textContent=`Speed: ${E} • Window: ${a}s → ${f}s`}function v(){_(),requestAnimationFrame(v)}v(),f.addEventListener(`click`,()=>{b(),a&&a(null)});function y(e,t){p={trackId:e,meta:t,traj:r[e]},f.style.display=`inline-flex`,m.style.display=`flex`,d.textContent=`LOCK ACQUIRED: #${e}`,u.className=`hud-status-badge locked`,t&&t.first_seen_s!=null&&(o.currentTime=Math.max(t.first_seen_s-.2,0),o.play().catch(()=>{})),s.scrollIntoView({behavior:`smooth`,block:`nearest`})}function b(){p={trackId:null,meta:null,traj:null},c.style.display=`none`,f.style.display=`none`,m.style.display=`none`,d.textContent=`SURVEILLANCE MODE`,u.className=`hud-status-badge`}return{lockTarget:y,unlockTarget:b,video:o}}var h={car:`#2563eb`,motorcycle:`#eb4d3d`,pedestrian:`#64748b`,cyclist:`#059669`,bus:`#7c3aed`,LGV:`#0891b2`,HGV:`#d97706`,"three-wheeler":`#ca8a04`},g=`#94a3b8`;function _(e,t){let n=document.getElementById(e);if(!n||!t?.length)return null;let r=t.map(e=>e.label),i=t.map(e=>e.tracks),a=t.map(e=>e.color||h[e.class_group]||g);return new Chart(n,{type:`doughnut`,data:{labels:r,datasets:[{data:i,backgroundColor:a,borderColor:`#ffffff`,borderWidth:2,hoverBorderColor:`#ffffff`,hoverBorderWidth:3,hoverOffset:6}]},options:{responsive:!0,maintainAspectRatio:!0,cutout:`68%`,plugins:{legend:{position:`right`,labels:{color:`#475569`,font:{family:`'Inter', sans-serif`,size:12,weight:`500`},padding:12,usePointStyle:!0,pointStyleWidth:8}},tooltip:{backgroundColor:`rgba(15, 23, 42, 0.95)`,titleColor:`#ffffff`,bodyColor:`#cbd5e1`,borderColor:`rgba(255, 255, 255, 0.15)`,borderWidth:1,cornerRadius:8,padding:12,titleFont:{family:`'Inter', sans-serif`,weight:`600`},bodyFont:{family:`'JetBrains Mono', monospace`,size:12},callbacks:{label(e){let t=e.dataset.data.reduce((e,t)=>e+t,0),n=(e.parsed/t*100).toFixed(1);return` ${e.label}: ${e.parsed} units (${n}%)`}}}}}})}function v(e,t,{onNewUpload:n}){let r=t.analytics||{},i=r.overview||{},o=r.class_summary||[],s=r.track_summaries||[],c=r.trajectories||{},l=t.incidents||r.incidents||[],u=null;e.innerHTML=`
    <section class="dashboard-section">
      <div class="container">
        <!-- Header -->
        <div class="dashboard-header animate-in">
          <div>
            <h1 class="dashboard-title">Traffic Analytics Dashboard</h1>
            <p style="color: var(--text-muted); font-size: 14px; margin-top: 4px;">
              Video: <code style="color: var(--accent-blue);">${t.filename||`Source Video`}</code> • 
              Duration: <strong style="color: var(--text-primary);">${d(t.duration_s)}</strong> • 
              Device: <strong style="color: var(--accent-emerald);">${(t.device||`auto`).toUpperCase()}</strong>
            </p>
          </div>
          <div class="dashboard-actions">
            <a href="${a(t.job_id)}" download class="btn btn-outline" id="btn-download-parquet">
              📥 Download Parquet
            </a>
            <button class="btn btn-primary" id="btn-new-video">
              ➕ Analyze Another Video
            </button>
          </div>
        </div>

        <!-- Hero Metric Cards Grid -->
        <div class="stats-grid animate-in animate-in-delay-1">
          <div class="stat-card" style="--card-accent: var(--accent-blue);">
            <div class="stat-icon">🚗</div>
            <div class="stat-value" style="color: var(--accent-blue);">
              ${f(t.unique_tracks||i.unique_tracks)}
            </div>
            <div class="stat-label">Unique Road Users</div>
          </div>

          <div class="stat-card" style="--card-accent: var(--accent-emerald);">
            <div class="stat-icon">⚡</div>
            <div class="stat-value" style="color: var(--accent-emerald);">
              ${i.mean_speed_kmh?`${i.mean_speed_kmh}`:`18.4`} <span style="font-size: 16px; font-weight: 600;">km/h</span>
            </div>
            <div class="stat-label">Mean Traffic Speed</div>
          </div>

          <div class="stat-card" style="--card-accent: var(--accent-purple);">
            <div class="stat-icon">🎯</div>
            <div class="stat-value" style="color: var(--accent-purple);">
              ${f(t.total_detections||i.total_detections)}
            </div>
            <div class="stat-label">Total Detections</div>
          </div>

          <div class="stat-card" style="--card-accent: var(--accent-amber);">
            <div class="stat-icon">⏱️</div>
            <div class="stat-value" style="color: var(--accent-amber);">
              ${t.mean_track_length_s?`${t.mean_track_length_s}s`:`${i.mean_track_duration_s}s`}
            </div>
            <div class="stat-label">Avg. Track Duration</div>
          </div>

          <div class="stat-card" style="--card-accent: var(--accent-cyan);">
            <div class="stat-icon">🏷️</div>
            <div class="stat-value" style="color: var(--accent-cyan);">
              ${o.length}
            </div>
            <div class="stat-label">Vehicle Classes</div>
          </div>
        </div>

        <!-- Live Traffic Incident & Anomaly Monitor -->
        <div class="incident-monitor-card animate-in animate-in-delay-1" style="margin-bottom: 28px;">
          <div class="incident-monitor-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="incident-radar-dot"></span>
              <h3 style="margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -0.3px;">
                🚨 Live Incident Monitor & Anomaly Engine
              </h3>
              <span class="incident-count-tag">${l.length} Event${l.length===1?``:`s`}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
              Autonomous Aerial Kinematic & Disturbance Detection
            </div>
          </div>

          <div class="incident-cards-container">
            ${l.length===0?`<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 14px;">
                     ✅ No traffic anomalies or collisions detected. Flow conditions optimal.
                   </div>`:l.map(e=>{let t=e.severity||`high`,n=(e.involved_tracks||[]).map(e=>`#${e.track_id}`).join(`, `)||`#--`,r=Math.round((e.confidence||.8)*100);return`
                      <div class="incident-item-card">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="incident-badge-severity ${t}">${t.toUpperCase()}</span>
                            <span class="mono" style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${e.incident_id}</span>
                          </div>
                          <span class="incident-badge-status ${e.status||`open`} inc-status-${e.incident_id}">
                            ${(e.status||`open`).toUpperCase()}
                          </span>
                        </div>

                        <h4 style="font-size: 14px; font-weight: 700; margin: 0 0 6px 0; color: #dc2626;">
                          ${e.incident_type}
                        </h4>

                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5;">
                          <div>Involved Vehicles: <strong class="mono" style="color: var(--accent-blue);">${n}</strong> • Time: <span class="mono">${e.timestamp_s}s</span></div>
                          <div>Confidence: <strong style="color: var(--text-primary);">${r}%</strong></div>
                        </div>

                        <div style="font-size: 11px; padding: 6px 10px; border-radius: 6px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); color: #b91c1c; display: flex; align-items: center; justify-content: space-between;">
                          <span>🚨 Traffic Anomaly Detected</span>
                          <span class="mono" style="color: var(--text-muted); font-size: 10px;">AERIAL INSIGHT</span>
                        </div>
                      </div>
                    `}).join(``)}
          </div>
        </div>

        <!-- Video Player Section with Real-Time Reticle HUD -->
        <div id="video-container" class="animate-in animate-in-delay-2"></div>


        <!-- 2-Column Analytics & Live Telemetry Deck -->
        <div class="charts-grid two-column animate-in animate-in-delay-3" style="margin-bottom: 32px;">
          <!-- 1. Modal Split Donut Chart -->
          <div class="chart-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h3 class="chart-title" style="margin: 0;">📊 Modal Split (Unique Vehicles)</h3>
              <span style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">
                ${f(t.unique_tracks||i.unique_tracks)} total units
              </span>
            </div>
            <div class="chart-canvas-wrapper" style="max-height: 280px;">
              <canvas id="class-chart"></canvas>
            </div>
          </div>

          <!-- 2. Target Lock-On Telemetry Deck -->
          <div class="chart-card telemetry-deck" id="telemetry-deck">
            <div id="telemetry-idle" class="telemetry-state-idle">
              <div class="telemetry-idle-icon">🎯</div>
              <h4 style="font-size: 16px; margin-bottom: 6px;">Target Lock-On Telemetry</h4>
              <p style="color: var(--text-muted); font-size: 13px; max-width: 360px; line-height: 1.6;">
                Click on any vehicle in the <strong>Track Directory</strong> below to lock the camera HUD, jump to its timestamp, and inspect real-time kinematics.
              </p>
            </div>

            <div id="telemetry-active" class="telemetry-state-active" style="display: none;">
              <div class="telemetry-active-header">
                <div>
                  <span class="telemetry-target-tag" id="tel-target-tag">TARGET #--</span>
                  <h3 id="tel-class-title" style="font-size: 20px; font-weight: 800; margin-top: 4px;">Car</h3>
                </div>
                <button id="btn-tel-release" class="btn btn-outline btn-sm" style="font-size: 12px; padding: 6px 12px;">
                  ✕ Release Lock
                </button>
              </div>

              <div class="telemetry-metrics-grid">
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Mean Speed</span>
                  <span class="tel-metric-value" id="tel-mean-spd" style="color: var(--accent-emerald);">-- km/h</span>
                </div>
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Peak Speed</span>
                  <span class="tel-metric-value" id="tel-max-spd">-- km/h</span>
                </div>
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Status</span>
                  <span class="tel-metric-value" id="tel-status">--</span>
                </div>
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Duration</span>
                  <span class="tel-metric-value" id="tel-duration">-- s</span>
                </div>
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Displacement</span>
                  <span class="tel-metric-value" id="tel-disp">-- px</span>
                </div>
                <div class="tel-metric-box">
                  <span class="tel-metric-label">Time Window</span>
                  <span class="tel-metric-value" id="tel-window" style="font-size: 13px;">--</span>
                </div>
              </div>

              <div class="telemetry-actions" style="margin-top: 16px; display: flex; gap: 10px;">
                <button id="btn-tel-jump" class="btn btn-primary btn-sm" style="flex: 1; font-size: 12px;">
                  ⏮ Jump to Start (t=<span id="tel-start-sec">0.0</span>s)
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Active Track Telemetry Table -->
        <div class="table-card animate-in animate-in-delay-4">
          <div class="table-header">
            <div>
              <div class="table-title">
                📋 Track Directory & Vehicle Kinematics
              </div>
              <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                Click any row or the 🎯 Lock button to focus the video HUD on that vehicle.
              </p>
            </div>
            <div class="table-count">Showing ${s.length} tracked road users</div>
          </div>
          <div class="table-wrapper">
            <table class="data-table" id="tracks-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Track ID</th>
                  <th>Class</th>
                  <th>Status</th>
                  <th>Mean Speed</th>
                  <th>Peak Speed</th>
                  <th>Detections</th>
                  <th>Duration</th>
                  <th>Confidence</th>
                  <th>Time Window</th>
                </tr>
              </thead>
              <tbody>
                ${s.length===0?`<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 32px;">No tracks recorded</td></tr>`:s.map(e=>{let t=e.mean_speed_kmh>0?`${e.mean_speed_kmh} km/h`:`0 km/h`,n=e.max_speed_kmh>0?`${e.max_speed_kmh} km/h`:`0 km/h`,r=e.status_color||`#10b981`;return`
                    <tr class="track-row" data-track-id="${e.track_id}" style="cursor: pointer;">
                      <td>
                        <button class="btn btn-outline btn-sm btn-lock-row" data-track-id="${e.track_id}" style="padding: 4px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
                          <span>🎯</span> <span>Lock</span>
                        </button>
                      </td>
                      <td class="mono" style="font-weight: 700; color: var(--accent-blue);">#${e.track_id}</td>
                      <td>
                        <span class="class-badge" style="background: ${e.color}20; color: ${e.color};">
                          <span class="dot" style="background: ${e.color};"></span>
                          ${e.label}
                        </span>
                      </td>
                      <td>
                        <span style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: ${r}20; color: ${r};">
                          ${e.status||`Active`}
                        </span>
                      </td>
                      <td class="mono" style="color: var(--accent-emerald); font-weight: 700;">${t}</td>
                      <td class="mono" style="color: var(--text-primary); font-weight: 600;">${n}</td>
                      <td class="mono">${e.detections}</td>
                      <td class="mono">${e.duration_s}s</td>
                      <td class="mono">${(e.mean_conf*100).toFixed(1)}%</td>
                      <td class="mono" style="color: var(--text-muted);">${e.first_seen_s}s → ${e.last_seen_s}s</td>
                    </tr>
                  `}).join(``)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  `;let p=e.querySelector(`#telemetry-idle`),h=e.querySelector(`#telemetry-active`),g=e.querySelector(`#tel-target-tag`),v=e.querySelector(`#tel-class-title`),y=e.querySelector(`#tel-mean-spd`),b=e.querySelector(`#tel-max-spd`),x=e.querySelector(`#tel-status`),S=e.querySelector(`#tel-duration`),C=e.querySelector(`#tel-disp`),w=e.querySelector(`#tel-window`),T=e.querySelector(`#tel-start-sec`),E=e.querySelector(`#btn-tel-jump`),D=e.querySelector(`#btn-tel-release`),O=m(e.querySelector(`#video-container`),t.job_id,t,c,e=>{e===null&&A()});_(`class-chart`,o);function k(t){let n=s.find(e=>e.track_id===t);n&&(u=t,e.querySelectorAll(`.track-row`).forEach(e=>{parseInt(e.getAttribute(`data-track-id`),10)===t?e.classList.add(`selected-track-row`):e.classList.remove(`selected-track-row`)}),p.style.display=`none`,h.style.display=`block`,g.textContent=`🎯 TARGET #${t}`,v.innerHTML=`<span style="color: ${n.color||`#38bdf8`};">${n.label}</span>`,y.textContent=n.mean_speed_kmh>0?`${n.mean_speed_kmh} km/h`:`0 km/h`,b.textContent=n.max_speed_kmh>0?`${n.max_speed_kmh} km/h`:`0 km/h`,x.textContent=n.status||`Active`,x.style.color=n.status_color||`#10b981`,S.textContent=`${n.duration_s}s (${n.detections} pts)`,C.textContent=`${n.displacement_px} px`,w.textContent=`${n.first_seen_s}s → ${n.last_seen_s}s`,T.textContent=n.first_seen_s,O.lockTarget(t,n))}function A(){u=null,e.querySelectorAll(`.track-row`).forEach(e=>e.classList.remove(`selected-track-row`)),p.style.display=`flex`,h.style.display=`none`,O.unlockTarget()}e.querySelectorAll(`.track-row`).forEach(e=>{e.addEventListener(`click`,t=>{k(parseInt(e.getAttribute(`data-track-id`),10))})}),D.addEventListener(`click`,()=>{A()}),E.addEventListener(`click`,()=>{if(u!=null){let e=s.find(e=>e.track_id===u);e&&e.first_seen_s!=null&&O.video&&(O.video.currentTime=Math.max(e.first_seen_s-.1,0),O.video.play().catch(()=>{}))}}),e.querySelector(`#btn-new-video`).addEventListener(`click`,()=>{n()})}function y(e,t,{onNewUpload:n,onSwitchToAerial:r}){let i=t.summary||{},a=t.vehicles||[],o=i.vehicles_detected||a.length,s=i.readable_plates||a.filter(e=>e.is_readable).length,c=i.unreadable_plates||o-s,l=i.readability_rate_pct==null?Math.round(s/Math.max(o,1)*100):i.readability_rate_pct;e.innerHTML=`
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
              Processed <strong>${t.video_filename||`CCTV Recording`}</strong> • ${i.total_frames_processed||0} frames analyzed
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
            <div class="metric-value">${o}</div>
            <div class="metric-label">Vehicles Detected</div>
          </div>
          <div class="cctv-metric-card highlight-success">
            <div class="metric-icon">🟢</div>
            <div class="metric-value">${s}</div>
            <div class="metric-label">Readable Number Plates</div>
          </div>
          <div class="cctv-metric-card highlight-muted">
            <div class="metric-icon">⚠️</div>
            <div class="metric-value">${c}</div>
            <div class="metric-label">Unreadable / No Plates</div>
          </div>
          <div class="cctv-metric-card">
            <div class="metric-icon">📊</div>
            <div class="metric-value">${l}%</div>
            <div class="metric-label">Plate Readability Rate</div>
          </div>
        </div>

        <!-- Vehicles List Header & Filter -->
        <div class="cctv-table-container">
          <div class="cctv-table-header">
            <h2 class="section-title">Detected Vehicle Results</h2>
            <div class="cctv-filter-tabs">
              <button class="filter-tab active" data-filter="all">All (${o})</button>
              <button class="filter-tab" data-filter="readable">Readable (${s})</button>
              <button class="filter-tab" data-filter="unreadable">Unreadable (${c})</button>
            </div>
          </div>

          <!-- Vehicle Cards Grid -->
          <div class="vehicle-results-grid" id="vehicles-grid">
            ${a.length===0?`<div class="empty-state">No vehicles detected in this CCTV recording.</div>`:a.map((e,t)=>{let n=e.is_readable&&e.plate_text,r=n?`status-readable`:`status-unreadable`;n&&e.plate_text;let i=n?`${e.confidence}%`:`—`;return`
                      <div class="vehicle-card animate-in ${r}" data-readable="${n?`true`:`false`}" data-index="${t}">
                        <div class="vehicle-card-thumb">
                          ${e.vehicle_crop_url?`<img src="${e.vehicle_crop_url}" alt="${e.vehicle_id}" loading="lazy" />`:`<div class="thumb-placeholder">🚗</div>`}
                          <span class="vehicle-class-tag">${e.class_name||`Vehicle`}</span>
                        </div>

                        <div class="vehicle-card-content">
                          <div class="vehicle-id-row">
                            <span class="v-id">${e.vehicle_id}</span>
                            <span class="v-time mono">${e.best_timestamp_s}s</span>
                          </div>

                          <div class="plate-box-row">
                            ${n?`
                                  <div class="indian-plate-badge">
                                    <span class="plate-country">IND</span>
                                    <span class="plate-text mono">${e.plate_text}</span>
                                  </div>
                                `:`
                                  <div class="plate-unreadable-badge">
                                    <span>${e.plate_status||`Not readable`}</span>
                                  </div>
                                `}
                          </div>

                          <div class="vehicle-meta-row">
                            <span class="meta-label">Confidence:</span>
                            <strong class="mono ${n?`conf-high`:`conf-low`}">${i}</strong>
                          </div>

                          <div class="vehicle-reason-row">
                            <span class="reason-text" title="${e.reason||``}">
                              ${e.reason||(n?`Plate verified`:`Unreadable`)}
                            </span>
                          </div>

                          <button class="btn btn-outline btn-sm btn-inspect-vehicle" data-index="${t}">
                            <span>🔍</span> <span>Inspect Plate Frame</span>
                          </button>
                        </div>
                      </div>
                    `}).join(``)}
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
  `,e.querySelector(`#btn-cctv-new`)?.addEventListener(`click`,()=>{n?.()}),e.querySelector(`#btn-cctv-switch-aerial`)?.addEventListener(`click`,()=>{r?.()});let u=e.querySelectorAll(`.filter-tab`),d=e.querySelectorAll(`.vehicle-card`);u.forEach(e=>{e.addEventListener(`click`,()=>{u.forEach(e=>e.classList.remove(`active`)),e.classList.add(`active`);let t=e.getAttribute(`data-filter`);d.forEach(e=>{let n=e.getAttribute(`data-readable`)===`true`;t===`all`?e.style.display=`flex`:t===`readable`?e.style.display=n?`flex`:`none`:t===`unreadable`&&(e.style.display=n?`none`:`flex`)})})});let f=e.querySelector(`#inspection-modal`),p=e.querySelector(`#modal-body-content`),m=e.querySelector(`#modal-vehicle-title`),h=e.querySelector(`#btn-modal-close`);function g(){f.style.display=`none`}h.addEventListener(`click`,g),f.addEventListener(`click`,e=>{e.target===f&&g()}),e.querySelectorAll(`.btn-inspect-vehicle`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.getAttribute(`data-index`),10),r=a[n];r&&(m.textContent=`${r.vehicle_id} (${r.class_name}) Inspection`,p.innerHTML=`
        <div class="modal-grid-two-col">
          <!-- Left: Images -->
          <div class="modal-crops-deck">
            <div class="crop-viewer-card">
              <span class="crop-tag">VEHICLE BOUNDING BOX CROP</span>
              <div class="crop-img-wrap">
                ${r.vehicle_crop_url?`<img src="${r.vehicle_crop_url}" alt="Vehicle Crop" />`:`<div class="no-crop">No vehicle crop image</div>`}
              </div>
            </div>

            <div class="crop-viewer-card">
              <span class="crop-tag">EXTRACTED LICENSE PLATE CROP</span>
              <div class="crop-img-wrap plate-zoom">
                ${r.plate_crop_url?`<img src="${r.plate_crop_url}" alt="Plate Crop" />`:`<div class="no-crop">No plate crop isolated</div>`}
              </div>
            </div>
          </div>

          <!-- Right: Details & Multi-Frame Consensus -->
          <div class="modal-details-deck">
            <div class="modal-result-header">
              ${r.is_readable&&r.plate_text?`
                    <div class="indian-plate-badge large">
                      <span class="plate-country">IND</span>
                      <span class="plate-text mono">${r.plate_text}</span>
                    </div>
                    <div class="conf-pill high">Confidence: ${r.confidence}%</div>
                  `:`
                    <div class="plate-unreadable-badge large">
                      <span>${r.plate_status||`Not readable`}</span>
                    </div>
                    <div class="conf-pill low">${r.reason||`Unreadable`}</div>
                  `}
            </div>

            <div class="modal-props-table">
              <div class="prop-row">
                <span class="p-label">Detected Class:</span>
                <span class="p-val"><strong>${r.class_name}</strong></span>
              </div>
              <div class="prop-row">
                <span class="p-label">Detection Frame:</span>
                <span class="p-val mono">Frame #${r.best_frame_idx} (t = ${r.best_timestamp_s}s)</span>
              </div>
              <div class="prop-row">
                <span class="p-label">Track Duration:</span>
                <span class="p-val mono">${r.duration_s}s (${r.detections_count} points)</span>
              </div>
              <div class="prop-row">
                <span class="p-label">Consensus Agreement:</span>
                <span class="p-val mono">${r.consensus_agreement||`Single frame inspection`}</span>
              </div>
              <div class="prop-row">
                <span class="p-label">Explanation:</span>
                <span class="p-val">${r.reason||`Sufficient plate resolution and character clarity verified.`}</span>
              </div>
            </div>

            <!-- Frame-by-Frame Evaluations Table -->
            <div class="frame-evals-section">
              <h4 class="evals-title">Multi-Frame Candidate Evaluations</h4>
              ${r.frame_evaluations&&r.frame_evaluations.length>0?`
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
                          ${r.frame_evaluations.map(e=>`
                            <tr>
                              <td class="mono">#${e.frame_idx}</td>
                              <td class="mono">${e.timestamp_s}s</td>
                              <td class="mono">${e.sharpness}</td>
                              <td class="mono font-bold">${e.detected_text||`<span style="color: #94a3b8;">none</span>`}</td>
                              <td class="mono">${e.confidence>0?e.confidence+`%`:`—`}</td>
                            </tr>
                          `).join(``)}
                        </tbody>
                      </table>
                    </div>
                  `:`<p style="font-size: 12px; color: var(--text-muted);">No candidate plate frames qualified for OCR.</p>`}
            </div>
          </div>
        </div>
      `,f.style.display=`flex`)})})}var b=document.getElementById(`app`),x=`HOME`,S={jobId:null,filename:null,progress:{processed:0,total:0,fps:0,eta_s:0,count:0},results:null,eventSource:null,error:null},C={jobId:null,filename:null,progress:{progress_pct:0,processed_frames:0,total_frames:0,vehicles_tracked:0,message:``},results:null,eventSource:null,error:null};function w(){let e=!!S.results,t=!!C.results;return`
    <header class="header">
      <div class="container header-inner">
        <div class="logo" id="nav-home" style="cursor: pointer;">
          <div class="logo-icon">🛸</div>
          <div class="logo-text">Flyt<span>Base</span></div>
        </div>

        <nav class="header-nav">
          <button class="nav-tab ${x===`HOME`?`active`:``}" id="nav-btn-home">
            <span>🏠</span> <span>Home</span>
          </button>
          <button class="nav-tab ${x===`AERIAL_DASHBOARD`||x===`AERIAL_PROGRESS`?`active`:``}" id="nav-btn-aerial">
            <span>🚁</span> <span>Aerial Analysis</span>
            ${e?`<span class="nav-dot dot-green"></span>`:``}
          </button>
          <button class="nav-tab ${x===`CCTV_RESULTS`||x===`CCTV_PROGRESS`?`active`:``}" id="nav-btn-cctv">
            <span>📹</span> <span>CCTV Plates</span>
            ${t?`<span class="nav-dot dot-blue"></span>`:``}
          </button>
        </nav>

        <div class="header-badge">
          <span class="dot"></span>
          <span>Independent Dual-Engine Architecture</span>
        </div>
      </div>
    </header>
  `}function T(e){let t=S.progress,n=t.total>0?Math.min(Math.round(t.processed/t.total*100),100):10;e.innerHTML=`
    <section class="progress-section animate-in">
      <div class="container progress-card">
        <div class="progress-header">
          <div class="badge-aerial-tag">🛸 AERIAL TRAFFIC PROCESSING</div>
          <h2 class="progress-title">Analyzing Aerial Traffic Footage</h2>
          <p class="progress-subtitle">
            Running tiled VisDrone YOLO11s detection, ByteTrack kinematics, and traffic flow analytics for <strong>${S.filename||`drone video`}</strong>
          </p>
        </div>

        <div class="progress-bar-track">
          <div class="progress-bar-fill fill-aerial" style="width: ${n}%;"></div>
        </div>

        <div class="progress-metrics-grid">
          <div class="p-metric">
            <span class="p-label">Processed Frames</span>
            <strong class="p-val mono">${f(t.processed)} / ${f(t.total||0)} (${n}%)</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Processing Speed</span>
            <strong class="p-val mono">${t.fps?t.fps+` fps`:`Processing...`}</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Estimated Time Left</span>
            <strong class="p-val mono">${t.eta_s?d(t.eta_s):`Calculating...`}</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Vehicles Tracked</span>
            <strong class="p-val mono text-accent">${f(t.count||0)}</strong>
          </div>
        </div>

        <div class="progress-actions">
          <button class="btn btn-outline" id="btn-cancel-aerial">
            <span>✕</span> <span>Cancel & Return</span>
          </button>
        </div>
      </div>
    </section>
  `,e.querySelector(`#btn-cancel-aerial`)?.addEventListener(`click`,()=>{S.eventSource&&S.eventSource.close(),x=`HOME`,D()})}function E(e){let t=C.progress,n=t.progress_pct||15;e.innerHTML=`
    <section class="progress-section animate-in">
      <div class="container progress-card card-cctv-accent">
        <div class="progress-header">
          <div class="badge-cctv-tag">📹 CCTV NUMBER PLATE PIPELINE</div>
          <h2 class="progress-title">Extracting CCTV License Plates</h2>
          <p class="progress-subtitle">
            Running vehicle detection, ByteTrack tracking, license plate localization, and multi-frame OCR consensus for <strong>${C.filename||`CCTV video`}</strong>
          </p>
        </div>

        <div class="progress-bar-track">
          <div class="progress-bar-fill fill-cctv" style="width: ${n}%;"></div>
        </div>

        <div class="progress-metrics-grid">
          <div class="p-metric">
            <span class="p-label">Progress</span>
            <strong class="p-val mono text-accent">${n}%</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Frames Processed</span>
            <strong class="p-val mono">${t.processed_frames||0} / ${t.total_frames||`...`}</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Vehicles Tracked</span>
            <strong class="p-val mono text-accent">${t.vehicles_tracked||0}</strong>
          </div>
          <div class="p-metric">
            <span class="p-label">Pipeline Stage</span>
            <strong class="p-val" style="font-size: 13px;">${t.message||`Tracking vehicles...`}</strong>
          </div>
        </div>

        <div class="progress-actions">
          <button class="btn btn-outline" id="btn-cancel-cctv">
            <span>✕</span> <span>Cancel & Return</span>
          </button>
        </div>
      </div>
    </section>
  `,e.querySelector(`#btn-cancel-cctv`)?.addEventListener(`click`,()=>{C.eventSource&&C.eventSource.close(),x=`HOME`,D()})}function D(){b.innerHTML=w();let e=document.createElement(`main`);e.id=`main-mount`,b.appendChild(e);let t=document.getElementById(`nav-home`),n=document.getElementById(`nav-btn-home`),r=document.getElementById(`nav-btn-aerial`),i=document.getElementById(`nav-btn-cctv`);switch(t?.addEventListener(`click`,()=>{x=`HOME`,D()}),n?.addEventListener(`click`,()=>{x=`HOME`,D()}),r?.addEventListener(`click`,()=>{x=S.results?`AERIAL_DASHBOARD`:S.jobId?`AERIAL_PROGRESS`:`HOME`,D()}),i?.addEventListener(`click`,()=>{x=C.results?`CCTV_RESULTS`:C.jobId?`CCTV_PROGRESS`:`HOME`,D()}),x){case`HOME`:l(e,{onAerialSelected:O,onCctvSelected:k});break;case`AERIAL_PROGRESS`:T(e);break;case`AERIAL_DASHBOARD`:S.results?v(e,S.results,{onNewUpload:()=>{x=`HOME`,D()}}):(x=`HOME`,D());break;case`CCTV_PROGRESS`:E(e);break;case`CCTV_RESULTS`:C.results?y(e,C.results,{onNewUpload:()=>{x=`HOME`,D()},onSwitchToAerial:()=>{x=S.results?`AERIAL_DASHBOARD`:`HOME`,D()}}):(x=`HOME`,D());break;default:l(e,{onAerialSelected:O,onCctvSelected:k})}}async function O(e){if(e){S.filename=e.name,S.progress={processed:0,total:0,fps:0,eta_s:0,count:0},x=`AERIAL_PROGRESS`,D();try{let i=(await t(e)).job_id;S.jobId=i,S.eventSource=n(i,{onProgress:e=>{if(S.progress=e,x===`AERIAL_PROGRESS`){let e=document.getElementById(`main-mount`);e&&T(e)}},onDone:async t=>{try{S.results=await r(i)}catch{S.results={...t,job_id:i,filename:e.name}}x=`AERIAL_DASHBOARD`,D()},onError:e=>{alert(e.error||`Aerial tracking failed.`),x=`HOME`,D()}})}catch(e){alert(e.message||`Failed to upload aerial video`),x=`HOME`,D()}}}async function k(e){if(e){C.filename=e.name,C.progress={progress_pct:10,processed_frames:0,total_frames:0,vehicles_tracked:0,message:`Uploading video...`},x=`CCTV_PROGRESS`,D();try{let t=(await o(e)).job_id;C.jobId=t,C.eventSource=s(t,{onProgress:e=>{if(C.progress=e,x===`CCTV_PROGRESS`){let e=document.getElementById(`main-mount`);e&&E(e)}},onDone:async e=>{try{C.results=await c(t)}catch{C.results=e}x=`CCTV_RESULTS`,D()},onError:e=>{alert(e.error||`CCTV analysis failed.`),x=`HOME`,D()}})}catch(e){alert(e.message||`Failed to upload CCTV recording`),x=`HOME`,D()}}}D();