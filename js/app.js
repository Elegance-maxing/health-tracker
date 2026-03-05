// Main app orchestration

// --- Screen navigation ---

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');

  // Run screen-specific setup
  if (screenId === 'screen-data') {
    loadDataStats();
  } else if (screenId === 'screen-pixels') {
    pixelYear = new Date().getFullYear();
    renderPixels();
  } else if (screenId === 'screen-settings') {
    renderSettingsPage();
  }
}

function goHome() {
  editingEntry = null;
  showScreen('screen-home');
  renderTimeline();
}

async function openEntryScreen(type) {
  const screenId = `screen-${type}`;
  showScreen(screenId);

  // Reset state and render
  clearEntryState(type);

  // Hide cancel button in create mode
  const cancelBtn = document.getElementById(`${type}-cancel-btn`);
  if (cancelBtn) cancelBtn.classList.add('hidden');

  if (type === 'measurement') {
    await renderMeasurementFields();
    document.getElementById('measurement-note').value = '';
  } else if (type === 'checkin') {
    renderRatingButtons();
    document.getElementById('checkin-note').value = '';
  } else if (type === 'photo') {
    document.getElementById('photo-preview').classList.remove('has-image');
    document.getElementById('photo-preview').src = '';
    document.getElementById('photo-capture-btn').style.display = '';
    document.getElementById('photo-capture-label').textContent = 'Tap to take or choose a photo';
    document.getElementById('photo-note').value = '';
    document.getElementById('photo-file-input').value = '';
  } else if (type === 'note') {
    document.getElementById('note-text').value = '';
  }

  await renderTagsFor(type);
}

// --- Settings page ---

async function renderSettingsPage() {
  // Measurement types
  const types = await getMeasurementTypes();
  const mtContainer = document.getElementById('settings-measurement-types');

  if (types.length === 0) {
    mtContainer.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem">No measurement types defined.</div>';
  } else {
    mtContainer.innerHTML = '<div class="manage-mt-list">' + types.map(mt => `
      <div class="manage-mt-item">
        <span class="mt-info">${mt.name} <span class="mt-unit">(${mt.unit})</span></span>
        <button class="mt-delete" onclick="deleteMT('${mt.id}')" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('') + '</div>';
  }

  // Tags
  const tags = await getAllTags();
  const tagContainer = document.getElementById('settings-tags');
  tagContainer.innerHTML = tags.map(t => {
    const safeName = t.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<span class="tag-chip" onclick="deleteTagPrompt('${t.id}', '${safeName}')">${escapeHtml(t.name)} (${t.useCount})</span>`;
  }).join('');
  if (tags.length === 0) {
    tagContainer.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem">No tags yet.</div>';
  }
}

async function addNewMeasurementType() {
  const nameInput = document.getElementById('new-mt-name');
  const unitInput = document.getElementById('new-mt-unit');
  const name = nameInput.value.trim();
  const unit = unitInput.value.trim();

  if (!name) {
    showToast('Enter a name for the measurement type.');
    return;
  }

  await addMeasurementType(name, unit || '-');
  nameInput.value = '';
  unitInput.value = '';
  showToast(`Added "${name}"`);
  renderSettingsPage();
}

async function deleteMT(id) {
  if (confirm('Remove this measurement type? Existing entries will keep their data.')) {
    await removeMeasurementType(id);
    showToast('Measurement type removed');
    renderSettingsPage();
  }
}

async function deleteTagPrompt(id, name) {
  if (confirm(`Delete tag "${name}"? Existing entries will keep this tag.`)) {
    await deleteTag(id);
    showToast('Tag deleted');
    renderSettingsPage();
  }
}

// --- Modal helpers ---

// Close modals on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// Close modals on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
});

// Handle Enter key in tag inputs
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id && e.target.id.endsWith('-tag-input')) {
    const screenName = e.target.id.replace('-tag-input', '');
    addTagFromInput(screenName);
    e.preventDefault();
  }
});

// Handle Enter in modal measurement type form
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (e.target.id === 'modal-mt-name' || e.target.id === 'modal-mt-unit') {
      confirmAddMeasurementType();
      e.preventDefault();
    }
  }
});

// --- PWA Install ---

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

// --- Persistent Storage ---

async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return;

  try {
    const alreadyPersisted = await navigator.storage.persisted();
    if (alreadyPersisted) return;

    const granted = await navigator.storage.persist();
    if (!granted) {
      showToast('Storage not guaranteed. Your data could be cleared if this device runs low on space.', 4000);
    }
  } catch (err) {
    console.warn('Persistent storage request failed:', err);
  }
}

// --- Init ---

async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  }

  // Seed defaults on first run
  await seedDefaults();

  // Request persistent storage so IndexedDB data survives storage pressure
  await requestPersistentStorage();

  // Render last backup indicator
  renderLastBackupIndicator();

  // Render home timeline
  currentDate = toDateString(new Date());
  await renderTimeline();
}

// Start the app
init();
