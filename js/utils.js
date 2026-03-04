// Utility functions

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDateFull(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function toDateString(date) {
  // Returns "YYYY-MM-DD" in local time
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isToday(dateStr) {
  return dateStr === toDateString(new Date());
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T12:00:00');
  const d2 = new Date(dateStr2 + 'T12:00:00');
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

// Debounce for search/filter inputs
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Simple toast notification
function showToast(message, duration = 2500) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Type icons
const TYPE_ICONS = {
  measurement: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><polyline points="18 9 12 15 9 12 3 18"/></svg>`,
  photo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  checkin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`
};

// Check-in rating labels and colors
const RATING_CONFIG = [
  { value: 1, label: 'Terrible', color: '#ef4444', face: ':(', bg: '#ef444420' },
  { value: 2, label: 'Bad', color: '#f97316', face: ':|', bg: '#f9731620' },
  { value: 3, label: 'Okay', color: '#eab308', face: '-', bg: '#eab30820' },
  { value: 4, label: 'Good', color: '#22c55e', face: ':)', bg: '#22c55e20' },
  { value: 5, label: 'Great', color: '#10b981', face: ':D', bg: '#10b98120' }
];

// Escape HTML to prevent XSS in rendered content
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Compress image before storing (resize to max 1200px wide, JPEG quality 0.8)
function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round(h * (maxWidth / w));
        w = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Image compression failed.')),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => reject(new Error('Failed to load image.'));
    img.src = url;
  });
}
