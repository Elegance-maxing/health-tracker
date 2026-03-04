// Entry creation logic for all four types

// State for current entry being created or edited
let selectedTags = {};  // { screenName: Set of tag names }
let selectedRating = null;
let currentPhotoBlob = null;
let editingEntry = null; // When set, save functions update instead of create

// --- Tag UI ---

async function renderTagsFor(screenName) {
  const containerId = `${screenName}-tags`;
  const container = document.getElementById(containerId);
  if (!container) return;

  const allTags = await getAllTags();
  const selected = selectedTags[screenName] || new Set();

  container.innerHTML = allTags.map(tag => {
    const isSelected = selected.has(tag.name);
    const safeName = tag.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<button class="tag-chip ${isSelected ? 'selected' : ''}"
              onclick="toggleTag('${screenName}', '${safeName}')">${escapeHtml(tag.name)}</button>`;
  }).join('');
}

function toggleTag(screenName, tagName) {
  if (!selectedTags[screenName]) selectedTags[screenName] = new Set();
  const set = selectedTags[screenName];
  if (set.has(tagName)) {
    set.delete(tagName);
  } else {
    set.add(tagName);
  }
  renderTagsFor(screenName);
}

async function addTagFromInput(screenName) {
  const inputId = `${screenName}-tag-input`;
  const input = document.getElementById(inputId);
  const name = input.value.trim().toLowerCase();
  if (!name) return;

  await createTag(name);

  // Auto-select the new tag
  if (!selectedTags[screenName]) selectedTags[screenName] = new Set();
  selectedTags[screenName].add(name);

  input.value = '';
  renderTagsFor(screenName);
}

function getSelectedTags(screenName) {
  return Array.from(selectedTags[screenName] || []);
}

function clearEntryState(screenName) {
  selectedTags[screenName] = new Set();
  selectedRating = null;
  currentPhotoBlob = null;
  editingEntry = null;
}

// --- Edit existing entry ---

async function openEditScreen(entryId) {
  const entry = await getEntry(entryId);
  if (!entry) {
    showToast('Entry not found.');
    return;
  }

  editingEntry = entry;
  const type = entry.type;
  const screenId = `screen-${type}`;

  showScreen(screenId);

  // Show cancel button in edit mode
  const cancelBtn = document.getElementById(`${type}-cancel-btn`);
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  // Pre-select tags
  selectedTags[type] = new Set(entry.tags || []);

  if (type === 'measurement') {
    await renderMeasurementFields();
    // Fill in measurement values
    if (entry.measurements) {
      for (const m of entry.measurements) {
        // Find the input by matching the data-mt-name attribute
        const inputs = document.querySelectorAll('#measurement-fields input[type="number"]');
        for (const input of inputs) {
          if (input.dataset.mtName === m.type) {
            input.value = m.value;
          }
        }
      }
    }
    document.getElementById('measurement-note').value = entry.note || '';
  } else if (type === 'photo') {
    // Show existing photo
    const preview = document.getElementById('photo-preview');
    if (entry.image instanceof Blob) {
      preview.src = URL.createObjectURL(entry.image);
    } else if (typeof entry.image === 'string') {
      preview.src = entry.image;
    }
    preview.classList.add('has-image');
    // Show capture button with "replace" text so user can optionally swap the photo
    const captureBtn = document.getElementById('photo-capture-btn');
    captureBtn.style.display = '';
    document.getElementById('photo-capture-label').textContent = 'Tap to replace photo (optional)';
    document.getElementById('photo-note').value = entry.note || '';
    document.getElementById('photo-file-input').value = '';
    // Keep currentPhotoBlob null to indicate "no new photo selected"
    currentPhotoBlob = null;
  } else if (type === 'note') {
    document.getElementById('note-text').value = entry.note || '';
  } else if (type === 'checkin') {
    renderRatingButtons();
    selectedRating = entry.rating;
    // Highlight the pre-selected rating
    document.querySelectorAll('.rating-btn').forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.dataset.rating) === entry.rating);
    });
    document.getElementById('checkin-note').value = entry.note || '';
  }

  await renderTagsFor(type);
}

// --- Measurement Entry ---

async function renderMeasurementFields() {
  const types = await getMeasurementTypes();
  const container = document.getElementById('measurement-fields');

  container.innerHTML = types.map(mt => `
    <div class="measurement-row">
      <span class="m-name">${mt.name}</span>
      <input type="number" step="any" inputmode="decimal"
             id="m-input-${mt.id}" placeholder="-"
             data-mt-name="${mt.name}" data-mt-unit="${mt.unit}">
      <span class="m-unit">${mt.unit}</span>
    </div>
  `).join('');
}

function showAddMeasurementType() {
  document.getElementById('modal-mt-name').value = '';
  document.getElementById('modal-mt-unit').value = '';
  document.getElementById('modal-add-mt').classList.add('active');
  document.getElementById('modal-mt-name').focus();
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

async function confirmAddMeasurementType() {
  const name = document.getElementById('modal-mt-name').value.trim();
  const unit = document.getElementById('modal-mt-unit').value.trim();

  if (!name) {
    showToast('Name is required.');
    return;
  }

  await addMeasurementType(name, unit || '-');
  closeModal('modal-add-mt');
  await renderMeasurementFields();
  showToast(`Added "${name}"`);
}

async function saveMeasurementEntry() {
  const inputs = document.querySelectorAll('#measurement-fields input[type="number"]');
  const measurements = [];

  for (const input of inputs) {
    const val = input.value.trim();
    if (val !== '') {
      measurements.push({
        type: input.dataset.mtName,
        value: parseFloat(val),
        unit: input.dataset.mtUnit
      });
    }
  }

  if (measurements.length === 0) {
    showToast('Fill in at least one measurement.');
    return;
  }

  const note = document.getElementById('measurement-note').value.trim();

  // Auto-tag based on measurement types filled
  const autoTags = new Set(getSelectedTags('measurement'));
  for (const m of measurements) {
    const name = m.type.toLowerCase();
    if (name.includes('bp') || name.includes('blood pressure')) autoTags.add('blood pressure');
    if (name.includes('heart') || name.includes('hr')) autoTags.add('heart');
    if (name.includes('weight')) autoTags.add('weight');
    if (name.includes('spo2') || name.includes('oxygen')) autoTags.add('oxygen');
    if (name.includes('temp')) autoTags.add('temperature');
  }

  // Ensure auto-generated tags exist before saving
  for (const t of autoTags) {
    await createTag(t);
  }

  if (editingEntry) {
    await updateEntry(editingEntry.id, {
      measurements,
      note: note || undefined,
      tags: Array.from(autoTags)
    });
    showToast('Entry updated');
  } else {
    const entry = {
      type: 'measurement',
      measurements,
      note: note || undefined,
      tags: Array.from(autoTags)
    };
    await saveEntry(entry);
    showToast('Measurement saved');
  }

  // Clear form
  for (const input of inputs) input.value = '';
  document.getElementById('measurement-note').value = '';
  clearEntryState('measurement');

  goHome();
}

// --- Photo Entry ---

async function handlePhotoSelected(input) {
  const file = input.files[0];
  if (!file) return;

  try {
    currentPhotoBlob = await compressImage(file);
    const preview = document.getElementById('photo-preview');
    preview.src = URL.createObjectURL(currentPhotoBlob);
    preview.classList.add('has-image');
    document.getElementById('photo-capture-btn').style.display = 'none';
  } catch (err) {
    showToast('Failed to process image: ' + err.message);
  }
}

async function savePhotoEntry() {
  const note = document.getElementById('photo-note').value.trim();
  const tags = getSelectedTags('photo');

  if (editingEntry) {
    const changes = {
      note: note || undefined,
      tags
    };
    // Only replace the image if a new one was selected
    if (currentPhotoBlob) {
      changes.image = currentPhotoBlob;
    }
    await updateEntry(editingEntry.id, changes);
    requestPersistentStorage();
    showToast('Entry updated');
  } else {
    if (!currentPhotoBlob) {
      showToast('Take or choose a photo first.');
      return;
    }

    const entry = {
      type: 'photo',
      image: currentPhotoBlob,
      note: note || undefined,
      tags
    };

    await saveEntry(entry);
    requestPersistentStorage();
    showToast('Photo saved');
  }

  // Reset
  document.getElementById('photo-preview').classList.remove('has-image');
  document.getElementById('photo-preview').src = '';
  document.getElementById('photo-capture-btn').style.display = '';
  document.getElementById('photo-note').value = '';
  document.getElementById('photo-file-input').value = '';
  clearEntryState('photo');

  goHome();
}

// --- Note Entry ---

async function saveNoteEntry() {
  const text = document.getElementById('note-text').value.trim();
  if (!text) {
    showToast('Write something first.');
    return;
  }

  const tags = getSelectedTags('note');

  if (editingEntry) {
    await updateEntry(editingEntry.id, {
      note: text,
      tags
    });
    showToast('Entry updated');
  } else {
    const entry = {
      type: 'note',
      note: text,
      tags
    };
    await saveEntry(entry);
    showToast('Note saved');
  }

  document.getElementById('note-text').value = '';
  clearEntryState('note');

  goHome();
}

// --- Check-in Entry ---

function renderRatingButtons() {
  const container = document.getElementById('rating-buttons');
  container.innerHTML = RATING_CONFIG.map(r => `
    <button class="rating-btn" data-rating="${r.value}" onclick="selectRating(${r.value})"
            style="color:${r.color}">
      <div class="rating-dot" style="background:${r.color}"></div>
      <span class="rating-label">${r.label}</span>
    </button>
  `).join('');
}

function selectRating(value) {
  selectedRating = value;
  document.querySelectorAll('.rating-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.rating) === value);
  });
}

async function saveCheckinEntry() {
  if (!selectedRating) {
    showToast('Select how you feel.');
    return;
  }

  const note = document.getElementById('checkin-note').value.trim();
  const tags = getSelectedTags('checkin');

  if (editingEntry) {
    await updateEntry(editingEntry.id, {
      rating: selectedRating,
      note: note || undefined,
      tags
    });
    showToast('Entry updated');
  } else {
    const entry = {
      type: 'checkin',
      rating: selectedRating,
      note: note || undefined,
      tags
    };
    await saveEntry(entry);
    showToast('Check-in saved');
  }

  document.getElementById('checkin-note').value = '';
  selectedRating = null;
  document.querySelectorAll('.rating-btn').forEach(btn => btn.classList.remove('selected'));
  clearEntryState('checkin');

  goHome();
}
