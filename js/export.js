// Export and Import functionality

// --- Export Modal ---

function showExportModal() {
  // Reset modal state
  document.querySelector('input[name="export-mode"][value="data-only"]').checked = true;
  document.getElementById('export-use-date-range').checked = false;
  document.getElementById('export-date-fields').style.display = 'none';

  // Default date range: last 30 days to today
  const today = toDateString(new Date());
  const thirtyDaysAgo = addDays(today, -30);
  document.getElementById('export-date-start').value = thirtyDaysAgo;
  document.getElementById('export-date-end').value = today;

  document.getElementById('modal-export').classList.add('active');
}

// Toggle date range fields visibility
document.addEventListener('change', (e) => {
  if (e.target.id === 'export-use-date-range') {
    document.getElementById('export-date-fields').style.display = e.target.checked ? '' : 'none';
  }
});

// --- Export ---

async function doExport() {
  try {
    // Read modal options
    const mode = document.querySelector('input[name="export-mode"]:checked').value;
    const useDateRange = document.getElementById('export-use-date-range').checked;
    const startDate = document.getElementById('export-date-start').value;
    const endDate = document.getElementById('export-date-end').value;

    if (useDateRange && (!startDate || !endDate)) {
      showToast('Pick both a start and end date.');
      return;
    }

    if (useDateRange && startDate > endDate) {
      showToast('Start date must be before end date.');
      return;
    }

    closeModal('modal-export');
    showToast('Preparing export...');

    const data = await buildExport(mode, useDateRange ? startDate : null, useDateRange ? endDate : null);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Build filename
    const dateStr = toDateString(new Date());
    const suffix = mode === 'data-only' ? '-data-only' : '-full';
    const rangeSuffix = useDateRange ? `-${startDate}-to-${endDate}` : '';
    const filename = `health-tracker${suffix}${rangeSuffix}-${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported ${data.entries.length} entries`);
  } catch (err) {
    showToast('Export failed: ' + err.message);
    console.error('Export error:', err);
  }
}

async function buildExport(mode, startDate, endDate) {
  // Get entries (filtered by date range or all)
  let entries;
  if (startDate && endDate) {
    entries = await getEntriesInRange(startDate, endDate);
  } else {
    entries = await db.entries.toArray();
  }

  const measurementTypes = await db.measurementTypes.toArray();
  const tags = await db.tags.toArray();

  const processedEntries = [];
  for (const entry of entries) {
    const processed = { ...entry };

    if (entry.type === 'photo') {
      if (mode === 'data-only') {
        // Strip the image data entirely, keep everything else
        delete processed.image;
        delete processed._imageEncoded;
        processed._photoStripped = true;
      } else {
        // Full backup: encode blobs to base64
        if (entry.image instanceof Blob) {
          processed.image = await blobToBase64(entry.image);
          processed._imageEncoded = true;
        }
      }
    }

    processedEntries.push(processed);
  }

  return {
    version: 1,
    exportMode: mode,
    exportedAt: new Date().toISOString(),
    entries: processedEntries,
    measurementTypes,
    tags
  };
}

// --- Import ---

async function doImport(input) {
  const file = input.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const result = await importData(data);
    showToast(`Imported ${result.imported} entries (${result.skipped} already existed)`);

    // Refresh timeline
    renderTimeline();

    // Reset file input
    input.value = '';
  } catch (err) {
    showToast('Import failed: ' + err.message);
    console.error('Import error:', err);
    input.value = '';
  }
}

// --- Data stats ---

async function loadDataStats() {
  const entries = await getAllEntries();
  const types = await getMeasurementTypes();
  const tags = await getAllTags();

  const counts = { measurement: 0, photo: 0, note: 0, checkin: 0 };
  for (const e of entries) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }

  const statsEl = document.getElementById('data-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      ${entries.length} total entries<br>
      ${counts.measurement} measurements, ${counts.photo} photos, ${counts.note} notes, ${counts.checkin} check-ins<br>
      ${types.length} measurement types, ${tags.length} tags
    `;
  }
}

async function confirmClearData() {
  const first = confirm('Delete ALL data? This cannot be undone.');
  if (!first) return;

  const second = confirm('Are you really sure? Every entry, photo, and setting will be permanently deleted.');
  if (!second) return;

  await db.entries.clear();
  await db.measurementTypes.clear();
  await db.tags.clear();

  // Re-seed defaults
  await seedDefaults();

  showToast('All data deleted');
  renderTimeline();
}

// --- Year in Pixels ---

let pixelYear = new Date().getFullYear();

function changePixelYear(delta) {
  pixelYear += delta;
  renderPixels();
}

async function renderPixels() {
  document.getElementById('pixel-year-label').textContent = pixelYear;

  const startDate = `${pixelYear}-01-01`;
  const endDate = `${pixelYear}-12-31`;

  const entries = await getEntriesInRange(startDate, endDate);

  // Build a map: dateStr -> average rating
  const dayRatings = {};
  for (const entry of entries) {
    if (entry.type === 'checkin' && entry.rating) {
      const dateStr = toDateString(new Date(entry.timestamp));
      if (!dayRatings[dateStr]) dayRatings[dateStr] = [];
      dayRatings[dateStr].push(entry.rating);
    }
  }

  const dayAverages = {};
  for (const [dateStr, ratings] of Object.entries(dayRatings)) {
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    dayAverages[dateStr] = Math.round(avg);
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const colors = {
    1: '#ef4444',
    2: '#f97316',
    3: '#eab308',
    4: '#22c55e',
    5: '#10b981'
  };

  let html = '<div style="display:flex;flex-direction:column;gap:2px">';

  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(pixelYear, month + 1, 0).getDate();
    html += '<div style="display:flex;align-items:center;gap:2px">';
    html += `<span style="width:28px;font-size:0.6rem;color:var(--text-muted);text-align:right;flex-shrink:0">${monthNames[month]}</span>`;

    for (let day = 1; day <= 31; day++) {
      if (day <= daysInMonth) {
        const dateStr = `${pixelYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const avg = dayAverages[dateStr];
        const color = avg ? colors[avg] : 'var(--bg-input)';
        const title = avg ? `${dateStr}: ${RATING_CONFIG[avg - 1].label} (${avg})` : dateStr;
        html += `<div class="pixel" style="background:${color}" title="${title}"></div>`;
      } else {
        html += `<div style="aspect-ratio:1"></div>`;
      }
    }

    html += '</div>';
  }

  html += '</div>';

  document.getElementById('pixels-container').innerHTML = html;
}
