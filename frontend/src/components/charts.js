/**
 * charts.js — Chart.js modal split chart.
 */

const CLASS_COLORS = {
  'car': '#2563eb',
  'motorcycle': '#eb4d3d',
  'pedestrian': '#64748b',
  'cyclist': '#059669',
  'bus': '#7c3aed',
  'LGV': '#0891b2',
  'HGV': '#d97706',
  'three-wheeler': '#ca8a04',
};

const FALLBACK_COLOR = '#94a3b8';

/**
 * Render the class breakdown doughnut chart.
 */
export function renderClassChart(canvasId, classSummary) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !classSummary?.length) return null;

  const labels = classSummary.map(c => c.label);
  const data = classSummary.map(c => c.tracks);
  const colors = classSummary.map(c => c.color || CLASS_COLORS[c.class_group] || FALLBACK_COLOR);

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverBorderColor: '#ffffff',
        hoverBorderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#475569',
            font: { family: "'Inter', sans-serif", size: 12, weight: '500' },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#ffffff',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: "'Inter', sans-serif", weight: '600' },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.parsed} units (${pct}%)`;
            },
          },
        },
      },
    },
  });
}
