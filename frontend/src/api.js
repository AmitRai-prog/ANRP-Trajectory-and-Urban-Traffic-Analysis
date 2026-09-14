/**
 * api.js — API client for the FastAPI backend.
 */

const API_BASE = '/api';

/**
 * Upload a video file. Returns { job_id, filename }.
 */
export async function uploadVideo(file) {
  const form = new FormData();
  form.append('video', file);

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed (${res.status})`);
  }

  return res.json();
}

/**
 * Subscribe to job progress via SSE. Returns an EventSource.
 *
 * @param {string} jobId
 * @param {object} handlers  { onProgress(data), onDone(data), onError(data) }
 * @returns {EventSource}
 */
export function subscribeProgress(jobId, { onProgress, onDone, onError }) {
  const es = new EventSource(`${API_BASE}/status/${jobId}`);

  es.addEventListener('progress', (e) => {
    onProgress?.(JSON.parse(e.data));
  });

  es.addEventListener('done', (e) => {
    onDone?.(JSON.parse(e.data));
    es.close();
  });

  es.addEventListener('error', (e) => {
    if (e.data) {
      onError?.(JSON.parse(e.data));
    } else {
      onError?.({ error: 'Connection lost' });
    }
    es.close();
  });

  return es;
}

/**
 * Fetch full results with analytics.
 */
export async function getResults(jobId) {
  const res = await fetch(`${API_BASE}/results/${jobId}`);
  if (!res.ok) throw new Error(`Failed to fetch results (${res.status})`);
  return res.json();
}

/**
 * Get the annotated video URL.
 */
export function getVideoUrl(jobId) {
  return `${API_BASE}/video/${jobId}`;
}

/**
 * Get the parquet download URL.
 */
export function getDownloadUrl(jobId) {
  return `${API_BASE}/download/${jobId}`;
}

/**
 * Fetch all registered cameras.
 */
export async function getCameras() {
  const res = await fetch(`${API_BASE}/cameras`);
  if (!res.ok) throw new Error(`Failed to fetch cameras (${res.status})`);
  return res.json();
}

/**
 * Fetch detected traffic incidents.
 */
export async function getIncidents(status = null) {
  const url = status ? `${API_BASE}/incidents?status=${status}` : `${API_BASE}/incidents`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch incidents (${res.status})`);
  return res.json();
}

/**
 * Fetch a single incident by ID.
 */
export async function getIncident(incidentId) {
  const res = await fetch(`${API_BASE}/incidents/${incidentId}`);
  if (!res.ok) throw new Error(`Failed to fetch incident (${res.status})`);
  return res.json();
}

/**
 * Trigger multi-camera incident investigation (CCTV tracking, Re-ID, ANPR).
 */
export async function investigateIncident(incidentId, cctvId = null) {
  const res = await fetch(`${API_BASE}/incidents/${incidentId}/investigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cctvId ? { cctv_id: cctvId } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Investigation failed (${res.status})`);
  }
  return res.json();
}

/**
 * Fetch global vehicle profile and cross-camera trajectory.
 */
export async function getGlobalVehicle(globalVehicleId) {
  const res = await fetch(`${API_BASE}/vehicles/${globalVehicleId}`);
  if (!res.ok) throw new Error(`Failed to fetch vehicle profile (${res.status})`);
  return res.json();
}

/**
 * Upload CCTV footage for a specific incident and run automated investigation.
 */
export async function uploadCctvForIncident(incidentId, file) {
  const form = new FormData();
  form.append('cctv_video', file);

  const res = await fetch(`${API_BASE}/incidents/${incidentId}/upload-cctv`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `CCTV upload investigation failed (${res.status})`);
  }

  return res.json();
}

/**
 * Get ANPR plate or vehicle crop URL.
 */
export function getAnprCropUrl(filename) {
  return `${API_BASE}/anpr/crop/${filename}`;
}

/**
 * Upload CCTV video for independent vehicle & plate analysis.
 * Returns { job_id, filename, status }.
 */
export async function uploadCctvVideo(file) {
  const form = new FormData();
  form.append('video', file);

  const res = await fetch(`${API_BASE}/cctv/analyze`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `CCTV upload failed (${res.status})`);
  }

  return res.json();
}

/**
 * Subscribe to independent CCTV analysis progress via SSE.
 */
export function subscribeCctvProgress(jobId, { onProgress, onDone, onError }) {
  const es = new EventSource(`${API_BASE}/cctv/status/${jobId}`);

  es.addEventListener('progress', (e) => {
    onProgress?.(JSON.parse(e.data));
  });

  es.addEventListener('done', (e) => {
    onDone?.(JSON.parse(e.data));
    es.close();
  });

  es.addEventListener('error', (e) => {
    if (e.data) {
      onError?.(JSON.parse(e.data));
    } else {
      onError?.({ error: 'Connection lost' });
    }
    es.close();
  });

  return es;
}

/**
 * Fetch full results of independent CCTV analysis.
 */
export async function getCctvResults(jobId) {
  const res = await fetch(`${API_BASE}/cctv/results/${jobId}`);
  if (!res.ok) throw new Error(`Failed to fetch CCTV results (${res.status})`);
  return res.json();
}



