// Entry creation logic for all four types

// State for current entry being created or edited
let selectedTags = {};  // { screenName: Set of tag names }
let selectedRating = null;
let currentPhotoBlobs = [];  // Array of blobs for multi-photo support
let existingPhotos = [];     // When editing, blobs from the existing entry to keep
let editingEntry = null;     // When set, save functions update instead of create

// --- Backward-compat helper for multi-photo ---

function getImagesFromEntry(entry) {
  if (entry.images && Array.isArray(entry.images)) {
    return [...entry.images];
  }
  if (entry.image) {
    return [entry.image];
  }
  return [];
}

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
  currentPhotoBlobs = [];
  existingPhotos = [];
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
    // Load existing photos into existingPhotos array (backward compat)
    existingPhotos = getImagesFromEntry(entry);
    currentPhotoBlobs = [];

    // Render thumbnails
    renderPhotoThumbnails();

    document.getElementById('photo-capture-label').textContent = 'Add more photos';
    document.getElementById('photo-note').value = entry.note || '';
    document.getElementById('photo-camera-input').value = '';
    document.getElementById('photo-file-input').value = '';
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
    const blob = await compressImage(file);
    currentPhotoBlobs.push(blob);
    renderPhotoThumbnails();
    // Reset file input so the same file can be re-selected
    input.value = '';
  } catch (err) {
    showToast('Failed to process image: ' + err.message);
  }
}

function removeNewPhoto(index) {
  currentPhotoBlobs.splice(index, 1);
  renderPhotoThumbnails();
}

function removeExistingPhoto(index) {
  existingPhotos.splice(index, 1);
  renderPhotoThumbnails();
}

function renderPhotoThumbnails() {
  const container = document.getElementById('photo-thumbnails');
  if (!container) return;

  const allPhotos = [];

  // Existing photos first (when editing)
  for (let i = 0; i < existingPhotos.length; i++) {
    const blob = existingPhotos[i];
    let src = '';
    if (blob instanceof Blob) {
      src = URL.createObjectURL(blob);
    } else if (typeof blob === 'string') {
      src = blob;
    }
    allPhotos.push(`
      <div class="photo-thumb">
        <img src="${src}" alt="Photo ${i + 1}">
        <button class="photo-thumb-remove" onclick="event.stopPropagation();removeExistingPhoto(${i})" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `);
  }

  // New photos
  for (let i = 0; i < currentPhotoBlobs.length; i++) {
    const src = URL.createObjectURL(currentPhotoBlobs[i]);
    allPhotos.push(`
      <div class="photo-thumb">
        <img src="${src}" alt="New photo ${i + 1}">
        <button class="photo-thumb-remove" onclick="event.stopPropagation();removeNewPhoto(${i})" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `);
  }

  container.innerHTML = allPhotos.join('');

  // Show or hide the thumbnail row
  if (allPhotos.length > 0) {
    container.classList.add('has-photos');
  } else {
    container.classList.remove('has-photos');
  }
}

async function savePhotoEntry() {
  const note = document.getElementById('photo-note').value.trim();
  const tags = getSelectedTags('photo');

  if (editingEntry) {
    // Combine existing photos (kept) with new photos
    const allImages = [...existingPhotos, ...currentPhotoBlobs];
    if (allImages.length === 0) {
      showToast('Add at least one photo.');
      return;
    }
    const changes = {
      images: allImages,
      note: note || undefined,
      tags
    };
    // Remove old single-image field if present
    if (editingEntry.image !== undefined) {
      changes.image = undefined;
    }
    await updateEntry(editingEntry.id, changes);
    requestPersistentStorage();
    showToast('Entry updated');
  } else {
    if (currentPhotoBlobs.length === 0) {
      showToast('Take or choose a photo first.');
      return;
    }

    const entry = {
      type: 'photo',
      images: currentPhotoBlobs,
      note: note || undefined,
      tags
    };

    await saveEntry(entry);
    requestPersistentStorage();
    showToast('Photo saved');
  }

  // Reset
  document.getElementById('photo-thumbnails').innerHTML = '';
  document.getElementById('photo-thumbnails').classList.remove('has-photos');
  document.getElementById('photo-note').value = '';
  document.getElementById('photo-camera-input').value = '';
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
