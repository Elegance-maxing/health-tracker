// Timeline rendering and navigation

let currentDate = toDateString(new Date());
let currentFilter = 'all';
let currentTagFilter = null;

function navigateDay(delta) {
  currentDate = addDays(currentDate, delta);
  renderTimeline();
}

function jumpToToday() {
  currentDate = toDateString(new Date());
  renderTimeline();
}

function setFilter(filter) {
  currentFilter = filter;
  currentTagFilter = null;

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === filter);
  });

  renderTimeline();
}

function setTagFilter(tagName) {
  if (currentTagFilter === tagName) {
    currentTagFilter = null;
  } else {
    currentTagFilter = tagName;
  }
  renderTimeline();
}

async function renderTimeline() {
  // Update header
  const titleEl = document.getElementById('timeline-title');
  const labelEl = document.getElementById('date-label');

  if (isToday(currentDate)) {
    titleEl.textContent = 'Today';
  } else {
    titleEl.textContent = formatDate(currentDate + 'T12:00:00');
  }
  labelEl.textContent = currentDate;

  // Fetch entries
  let entries = await getEntriesForDate(currentDate);

  // Apply type filter
  if (currentFilter !== 'all') {
    entries = entries.filter(e => e.type === currentFilter);
  }

  // Apply tag filter
  if (currentTagFilter) {
    entries = entries.filter(e => e.tags && e.tags.includes(currentTagFilter));
  }

  // Sort reverse chronological
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const container = document.getElementById('timeline-entries');

  if (entries.length === 0) {
    container.innerHTML = `<div class="timeline-empty">No entries${currentFilter !== 'all' ? ' for this filter' : ''}</div>`;
    return;
  }

  const cards = [];
  for (const entry of entries) {
    cards.push(await renderEntryCard(entry));
  }
  container.innerHTML = cards.join('');
}

async function renderEntryCard(entry) {
  const icon = TYPE_ICONS[entry.type] || '';
  const time = formatTime(entry.timestamp);
  let bodyHtml = '';

  switch (entry.type) {
    case 'measurement':
      bodyHtml = renderMeasurementBody(entry);
      break;
    case 'photo':
      bodyHtml = await renderPhotoBody(entry);
      break;
    case 'note':
      bodyHtml = `<div class="note-text">${escapeHtml(entry.note || '')}</div>`;
      break;
    case 'checkin':
      bodyHtml = renderCheckinBody(entry);
      break;
  }

  // Note for non-note types
  if (entry.type !== 'note' && entry.note) {
    bodyHtml += `<div class="note-text">${escapeHtml(entry.note)}</div>`;
  }

  // Tags
  let tagsHtml = '';
  if (entry.tags && entry.tags.length > 0) {
    tagsHtml = `<div class="entry-tags">${entry.tags.map(t => {
      const safe = t.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `<span class="entry-tag" onclick="event.stopPropagation();setTagFilter('${safe}')">${escapeHtml(t)}</span>`;
    }).join('')}</div>`;
  }

  // Detail section (shown on expand)
  const detailHtml = `
    <div class="entry-detail">
      <div class="detail-row">
        <span class="detail-label">Full timestamp</span>
        <span>${new Date(entry.timestamp).toLocaleString()}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">ID</span>
        <span style="font-family:var(--font-mono);font-size:0.7rem">${entry.id.slice(0, 8)}...</span>
      </div>
      <div class="detail-actions">
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();openEditScreen('${entry.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();confirmDeleteEntry('${entry.id}')">Delete</button>
      </div>
    </div>
  `;

  return `
    <div class="entry-card" onclick="this.classList.toggle('expanded')">
      <div class="entry-card-header">
        <span class="entry-icon">${icon}</span>
        <span class="entry-time">${time}</span>
        <span class="entry-type-label">${entry.type}</span>
      </div>
      <div class="entry-card-body">
        ${bodyHtml}
      </div>
      ${tagsHtml}
      ${detailHtml}
    </div>
  `;
}

function renderMeasurementBody(entry) {
  if (!entry.measurements || entry.measurements.length === 0) return '';
  const items = entry.measurements.map(m =>
    `<span class="m-item"><span class="m-value">${m.value}</span> <span class="m-unit">${m.unit}</span> ${m.type}</span>`
  ).join(' &middot; ');
  return `<div class="measurement-summary">${items}</div>`;
}

async function renderPhotoBody(entry) {
  let src = '';
  if (entry.image instanceof Blob) {
    src = URL.createObjectURL(entry.image);
  } else if (typeof entry.image === 'string') {
    src = entry.image;  // base64 data URL
  }
  let html = src ? `<img class="entry-photo" src="${src}" alt="Photo entry" loading="lazy">` : '';
  if (entry.originalFilename) {
    html += `<div class="photo-filename">${escapeHtml(entry.originalFilename)}</div>`;
  }
  return html;
}

function renderCheckinBody(entry) {
  const config = RATING_CONFIG.find(r => r.value === entry.rating) || RATING_CONFIG[2];
  return `
    <div class="checkin-rating">
      <span class="rating-indicator" style="background:${config.color}"></span>
      <span class="rating-text" style="color:${config.color}">${config.label}</span>
    </div>
  `;
}

async function confirmDeleteEntry(id) {
  if (confirm('Delete this entry? This cannot be undone.')) {
    await deleteEntry(id);
    showToast('Entry deleted');
    renderTimeline();
  }
}

// escapeHtml is defined in utils.js
