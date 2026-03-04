// Database layer using Dexie.js for IndexedDB
// All data stays local. No server, no cloud.

const db = new Dexie('HealthTracker');

db.version(1).stores({
  entries: 'id, timestamp, type, *tags',
  measurementTypes: 'id, name, sortOrder',
  tags: 'id, name, useCount'
});

// --- Entries ---

async function saveEntry(entry) {
  entry.id = entry.id || crypto.randomUUID();
  entry.timestamp = entry.timestamp || new Date().toISOString();
  await db.entries.put(entry);

  // Update tag use counts
  if (entry.tags && entry.tags.length > 0) {
    for (const tagName of entry.tags) {
      await incrementTagUseCount(tagName);
    }
  }

  return entry;
}

async function getEntry(id) {
  return db.entries.get(id);
}

async function updateEntry(id, changes) {
  // Update an existing entry in place, preserving id and timestamp
  const existing = await db.entries.get(id);
  if (!existing) throw new Error('Entry not found');

  const updated = { ...existing, ...changes, id: existing.id, timestamp: existing.timestamp };
  await db.entries.put(updated);
  return updated;
}

async function deleteEntry(id) {
  return db.entries.delete(id);
}

async function getEntriesForDate(dateStr) {
  // dateStr format: "YYYY-MM-DD"
  const start = new Date(dateStr + 'T00:00:00').toISOString();
  const end = new Date(dateStr + 'T23:59:59.999').toISOString();
  return db.entries
    .where('timestamp')
    .between(start, end, true, true)
    .reverse()
    .sortBy('timestamp');
}

async function getEntriesInRange(startDate, endDate) {
  const start = new Date(startDate + 'T00:00:00').toISOString();
  const end = new Date(endDate + 'T23:59:59.999').toISOString();
  return db.entries
    .where('timestamp')
    .between(start, end, true, true)
    .toArray();
}

async function getAllEntries() {
  return db.entries.toArray();
}

// --- Measurement Types ---

async function getMeasurementTypes() {
  return db.measurementTypes.orderBy('sortOrder').toArray();
}

async function addMeasurementType(name, unit) {
  const count = await db.measurementTypes.count();
  const mt = {
    id: crypto.randomUUID(),
    name: name.trim(),
    unit: unit.trim(),
    sortOrder: count
  };
  await db.measurementTypes.put(mt);
  return mt;
}

async function removeMeasurementType(id) {
  return db.measurementTypes.delete(id);
}

async function updateMeasurementTypeOrder(types) {
  const updates = types.map((t, i) => ({ ...t, sortOrder: i }));
  return db.measurementTypes.bulkPut(updates);
}

// --- Tags ---

async function getAllTags() {
  return db.tags.orderBy('useCount').reverse().toArray();
}

async function createTag(name) {
  const existing = await db.tags.where('name').equals(name.trim().toLowerCase()).first();
  if (existing) return existing;

  const tag = {
    id: crypto.randomUUID(),
    name: name.trim().toLowerCase(),
    useCount: 0
  };
  await db.tags.put(tag);
  return tag;
}

async function incrementTagUseCount(tagName) {
  const tag = await db.tags.where('name').equals(tagName.toLowerCase()).first();
  if (tag) {
    tag.useCount++;
    await db.tags.put(tag);
  }
}

async function deleteTag(id) {
  return db.tags.delete(id);
}

// --- Export/Import ---

async function exportAllData() {
  const entries = await db.entries.toArray();
  const measurementTypes = await db.measurementTypes.toArray();
  const tags = await db.tags.toArray();

  // Convert photo blobs to base64
  const processedEntries = [];
  for (const entry of entries) {
    const processed = { ...entry };
    if (entry.type === 'photo' && entry.image instanceof Blob) {
      processed.image = await blobToBase64(entry.image);
      processed._imageEncoded = true;
    }
    processedEntries.push(processed);
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: processedEntries,
    measurementTypes,
    tags
  };
}

async function importData(data) {
  if (!data || !data.entries) {
    throw new Error('Invalid import file: missing entries array.');
  }

  let imported = 0;
  let skipped = 0;

  // Import measurement types (merge by name)
  if (data.measurementTypes) {
    for (const mt of data.measurementTypes) {
      const existing = await db.measurementTypes.get(mt.id);
      if (!existing) {
        await db.measurementTypes.put(mt);
      }
    }
  }

  // Import tags (merge by name)
  if (data.tags) {
    for (const tag of data.tags) {
      const existing = await db.tags.where('name').equals(tag.name).first();
      if (!existing) {
        await db.tags.put(tag);
      } else {
        // Keep the higher use count
        if (tag.useCount > existing.useCount) {
          existing.useCount = tag.useCount;
          await db.tags.put(existing);
        }
      }
    }
  }

  // Import entries (merge by ID)
  for (const entry of data.entries) {
    const existing = await db.entries.get(entry.id);
    if (!existing) {
      // Convert base64 photos back to blobs
      if (entry._imageEncoded && typeof entry.image === 'string') {
        entry.image = base64ToBlob(entry.image);
        delete entry._imageEncoded;
      }
      // Clean up data-only export marker
      if (entry._photoStripped) {
        delete entry._photoStripped;
      }
      await db.entries.put(entry);
      imported++;
    } else {
      // Entry already exists. If the import has no image (data-only export)
      // but the existing entry does, keep the existing entry as-is.
      // Only update if the import actually has richer data.
      skipped++;
    }
  }

  return { imported, skipped };
}

// --- Helpers ---

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bytes = atob(parts[1]);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    arr[i] = bytes.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}

// --- Seed defaults if first run ---

async function seedDefaults() {
  const count = await db.measurementTypes.count();
  if (count === 0) {
    const defaults = [
      { name: 'Weight', unit: 'kg' },
      { name: 'Heart Rate', unit: 'bpm' },
      { name: 'BP Systolic', unit: 'mmHg' },
      { name: 'BP Diastolic', unit: 'mmHg' },
      { name: 'SpO2', unit: '%' },
      { name: 'Temperature', unit: 'C' }
    ];
    for (const d of defaults) {
      await addMeasurementType(d.name, d.unit);
    }
  }

  const tagCount = await db.tags.count();
  if (tagCount === 0) {
    const defaultTags = ['food', 'sleep', 'pain', 'exercise', 'medication', 'stress'];
    for (const t of defaultTags) {
      await createTag(t);
    }
  }
}
