/**
 * home.js — Dual-Card Landing Page: Independent Aerial Traffic Analysis & CCTV Number Plate Analysis.
 */

export function renderHome(container, { onAerialSelected, onCctvSelected }) {
  container.innerHTML = `
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
  `;

  // Bind Aerial card events
  const dropAerial = container.querySelector('#dropzone-aerial');
  const inputAerial = container.querySelector('#input-aerial');
  const btnAerial = container.querySelector('#btn-browse-aerial');

  btnAerial.addEventListener('click', (e) => {
    e.stopPropagation();
    inputAerial.click();
  });
  dropAerial.addEventListener('click', () => inputAerial.click());
  inputAerial.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      onAerialSelected(e.target.files[0]);
    }
  });

  setupDragDrop(dropAerial, (file) => onAerialSelected(file));

  // Bind CCTV card events
  const dropCctv = container.querySelector('#dropzone-cctv');
  const inputCctv = container.querySelector('#input-cctv');
  const btnCctv = container.querySelector('#btn-browse-cctv');

  btnCctv.addEventListener('click', (e) => {
    e.stopPropagation();
    inputCctv.click();
  });
  dropCctv.addEventListener('click', () => inputCctv.click());
  inputCctv.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      onCctvSelected(e.target.files[0]);
    }
  });

  setupDragDrop(dropCctv, (file) => onCctvSelected(file));
}

function setupDragDrop(zone, onFile) {
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFile(e.dataTransfer.files[0]);
    }
  });
}
