/**
 * Google Calendar Merger with per-source copy modes
 * - Mode: "ALL" | "TITLE_ONLY" | "BUSY_SECRET"
 * - BUSY_SECRET: title becomes "[prefix] 予定あり" (prefix per source)
 * - Guests are NEVER copied. If they appear, removeGuest() is called.
 * - Two deletion strategies:
 *    - DEDICATED_TARGET=true  -> delete ALL events in window (no markers needed)
 *    - DEDICATED_TARGET=false -> delete only events containing MIRROR_TAG
 */

const TARGET_CAL_ID = 'your-merged-calendar-id@group.calendar.google.com';

// === Deletion & description behavior switches ===
const DEDICATED_TARGET   = true;   // If target calendar is used ONLY for the merged view, set true
const ADD_MIRROR_TAG     = !DEDICATED_TARGET; // add a hidden-like marker in description to identify mirrored events
const ADD_SOURCE_LINE    = false;  // add "Source: <name> (<id>)" line in description
const ADD_ORIGINAL_URL   = false;  // add "Original: <url>" line in description

// === Sources ===
const SOURCES = [
  { id: 'source1@gmail.com', mode: 'ALL' },
  { id: 'team-project@group.calendar.google.com', mode: 'TITLE_ONLY' },
  { id: 'private-tasks@group.calendar.google.com', mode: 'BUSY_SECRET', prefix: 'Private' },
];

const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 180;
const TITLE_PREFIX_WITH_SOURCE = true; // for ALL/TITLE_ONLY modes
const MIRROR_TAG = '[MIRRORED_BY_GAS]'; // only used when ADD_MIRROR_TAG = true

function syncOnce() {
  const targetCal = CalendarApp.getCalendarById(TARGET_CAL_ID);
  if (!targetCal) throw new Error('TARGET_CAL_ID is invalid.');

  const now = new Date();
  const start = shiftDays(now, -WINDOW_PAST_DAYS);
  const end   = shiftDays(now,  WINDOW_FUTURE_DAYS);

  // 1) Clear target window
  if (DEDICATED_TARGET) {
    deleteAllInWindow_(targetCal, start, end);
  } else {
    deleteMirroredOnly_(targetCal, start, end, MIRROR_TAG);
  }

  // 2) Copy from each source
  for (const { id: calId, mode, prefix } of SOURCES) {
    const srcCal = CalendarApp.getCalendarById(calId);
    if (!srcCal) {
      console.warn('Skipped: calendar not found →', calId);
      continue;
    }

    const srcName = srcCal.getName() || calId;
    const events = srcCal.getEvents(start, end);

    events.forEach((ev) => {
      // ---- Title / desc / location by mode ----
      let title = ev.getTitle() || '';
      let description = '';
      let location = '';

      // Build header lines per switches (no "Source:" if ADD_SOURCE_LINE=false)
      const headerParts = [];
      if (ADD_MIRROR_TAG) headerParts.push(MIRROR_TAG);
      if (ADD_SOURCE_LINE) headerParts.push(`Source: ${srcName} (${calId})`);
      if (ADD_ORIGINAL_URL && typeof ev.getHtmlLink === 'function') {
        const u = ev.getHtmlLink();
        if (u) headerParts.push(`Original: ${u}`);
      }
      const header = headerParts.join('\n');

      const srcDesc = (typeof ev.getDescription === 'function') ? (ev.getDescription() || '') : '';
      const srcLoc  = (typeof ev.getLocation === 'function') ? (ev.getLocation() || '') : '';

      switch (mode) {
        case 'ALL':
          if (TITLE_PREFIX_WITH_SOURCE) title = `[${srcName}] ${title}`;
          description = [header, srcDesc].filter(Boolean).join('\n\n');
          location = srcLoc;
          break;

        case 'TITLE_ONLY':
          if (TITLE_PREFIX_WITH_SOURCE) title = `[${srcName}] ${title}`;
          description = header; // drop body
          location = '';        // drop location
          break;

        case 'BUSY_SECRET':
          const label = prefix || srcName;
          title = `[${label}] 予定あり`;
          description = header;
          location = '';
          break;

        default:
          description = header;
      }

      // ---- Create event (no guests set) ----
      const options = {
        description,
        location,
        sendInvites: false,
      };

      let created;
      if (isAllDay_(ev)) {
        created = targetCal.createAllDayEvent(title, ev.getAllDayStartDate(), {
          ...options,
          endTime: ev.getAllDayEndDate(),
        });
      } else {
        created = targetCal.createEvent(title, ev.getStartTime(), ev.getEndTime(), options);
      }

      // BUSY_SECRET -> private visibility
      if (mode === 'BUSY_SECRET') {
        try { created.setVisibility(CalendarApp.Visibility.PRIVATE); } catch (e) {}
      }

      // Copy color if possible
      try {
        if (typeof ev.getColor === 'function' && ev.getColor()) {
          created.setColor(ev.getColor());
        }
      } catch (e) {}

      // Safety: ensure no guests (should be none)
      try {
        const guests = created.getGuestList();
        if (guests && guests.length > 0) {
          guests.forEach(g => created.removeGuest(g.getEmail()));
        }
      } catch (e) {}
    });
  }
}

/** Delete ALL events in the window (for dedicated target calendars) */
function deleteAllInWindow_(cal, start, end) {
  const events = cal.getEvents(start, end);
  let count = 0;
  events.forEach((e) => { e.deleteEvent(); count++; });
  console.log(`Deleted (ALL in window): ${count}`);
}

/** Delete only mirrored events (identified by tag) */
function deleteMirroredOnly_(cal, start, end, tag) {
  const events = cal.getEvents(start, end);
  let count = 0;
  events.forEach((e) => {
    const desc = (typeof e.getDescription === 'function') ? (e.getDescription() || '') : '';
    if (desc.includes(tag)) { e.deleteEvent(); count++; }
  });
  console.log(`Deleted (mirrored-only): ${count}`);
}

/** All-day detector */
function isAllDay_(ev) {
  try {
    const s = ev.getAllDayStartDate();
    const e = ev.getAllDayEndDate();
    return s instanceof Date && e instanceof Date;
  } catch (_) {
    return false;
  }
}

/** Date shift */
function shiftDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Optional trigger helper */
function createTriggerEveryHour() {
  ScriptApp.newTrigger('syncOnce')
    .timeBased()
    .everyHours(1)
    .create();
}
