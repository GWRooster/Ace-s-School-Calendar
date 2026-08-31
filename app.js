/* ------------------------------------------------------------------
   APP LOGIC
   Renders the month calendar from schedule-data.js and syncs notes
   with Supabase (see config.js + supabase-setup.sql).
------------------------------------------------------------------- */

const DAY_COLORS = {
  1: "var(--day1)", 2: "var(--day2)", 3: "var(--day3)", 4: "var(--day4)",
  5: "var(--day5)", 6: "var(--day6)", 7: "var(--day7)",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

let current = new Date();
current.setDate(1);

let notesByDate = {}; // "YYYY-MM-DD" -> [ {id, note_date, body, author, created_at} ]
let supabaseClient = null;
let activeDateStr = null;

function pad(n) { return String(n).padStart(2, "0"); }
function isoDate(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function todayStr() {
  const t = new Date();
  return isoDate(t.getFullYear(), t.getMonth(), t.getDate());
}

function initSupabase() {
  const configured =
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_ANON_KEY === "string" &&
    !SUPABASE_URL.includes("PASTE_") &&
    !SUPABASE_ANON_KEY.includes("PASTE_");

  const warning = document.getElementById("configWarning");
  if (!configured) {
    warning.style.display = "block";
    warning.textContent = "Notes aren't connected yet — fill in config.js with your Supabase project URL and anon key (see README.md).";
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    warning.style.display = "block";
    warning.textContent = "Couldn't connect to Supabase — double check the values in config.js.";
  }
}

async function loadAllNotes() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("notes")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load notes:", error);
    document.getElementById("syncStatus").textContent = "Couldn't load notes: " + error.message;
    return;
  }
  notesByDate = {};
  for (const row of data) {
    (notesByDate[row.note_date] ||= []).push(row);
  }
  renderCalendar();
  if (activeDateStr) renderModalNotes(activeDateStr);
}

function subscribeRealtime() {
  if (!supabaseClient) return;
  supabaseClient
    .channel("notes-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, () => {
      loadAllNotes();
    })
    .subscribe();
}

function termsForDate(dateStr) {
  return TERMS.filter((t) => t.date === dateStr);
}

function renderCalendar() {
  const year = current.getFullYear();
  const month = current.getMonth();
  document.getElementById("monthLabel").textContent = `${MONTH_LABELS[month]} ${year}`;

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) {
    const d = daysInPrevMonth - firstWeekday + 1 + i;
    cells.push({ y: month === 0 ? year - 1 : year, m: month === 0 ? 11 : month - 1, d, otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ y: year, m: month, d, otherMonth: false });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1];
    const nd = new Date(last.y, last.m, last.d + 1);
    cells.push({ y: nd.getFullYear(), m: nd.getMonth(), d: nd.getDate(), otherMonth: true });
  }

  const today = todayStr();
  const grid = document.getElementById("daysGrid");
  grid.innerHTML = "";

  for (const cell of cells) {
    const dateStr = isoDate(cell.y, cell.m, cell.d);
    const dayNum = DAY_ROTATION[dateStr];
    const terms = termsForDate(dateStr);
    const notes = notesByDate[dateStr] || [];

    const el = document.createElement("div");
    el.className = "day-cell" + (cell.otherMonth ? " other-month" : "") + (dateStr === today ? " is-today" : "");
    el.dataset.date = dateStr;

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = cell.d;
    el.appendChild(num);

    if (dayNum) {
      const badge = document.createElement("div");
      badge.className = "day-badge";
      badge.style.background = DAY_COLORS[dayNum];
      badge.textContent = "Day " + dayNum;
      el.appendChild(badge);
    }

    if (terms.length) {
      const tb = document.createElement("div");
      tb.className = "term-badge";
      tb.textContent = terms.map((t) => t.label).join(" / ");
      el.appendChild(tb);
    }

    if (notes.length) {
      const row = document.createElement("div");
      row.className = "note-dot-row";
      const shown = notes.slice(0, 2);
      for (const n of shown) {
        const pill = document.createElement("div");
        pill.className = "note-pill";
        pill.textContent = n.body;
        row.appendChild(pill);
      }
      if (notes.length > shown.length) {
        const more = document.createElement("div");
        more.className = "note-more";
        more.textContent = `+${notes.length - shown.length} more`;
        row.appendChild(more);
      }
      el.appendChild(row);
    }

    el.addEventListener("click", () => openModal(dateStr));
    grid.appendChild(el);
  }
}

function formatLongDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function buildScheduleRows(dayNum) {
  const letters = DAY_LETTERS[dayNum];
  const rows = [];
  rows.push({ fixed: true, label: FIXED_PERIODS.advisory.label, time: FIXED_PERIODS.advisory.time, room: FIXED_PERIODS.advisory.room });
  rows.push({ fixed: false, label: BLOCK_TIMES[0].label, time: BLOCK_TIMES[0].time, subject: letters[0] });
  rows.push({ fixed: true, label: FIXED_PERIODS.open.label, time: FIXED_PERIODS.open.time });
  rows.push({ fixed: false, label: BLOCK_TIMES[1].label, time: BLOCK_TIMES[1].time, subject: letters[1] });
  rows.push({ fixed: true, label: FIXED_PERIODS.lunch.label, time: FIXED_PERIODS.lunch.time });
  rows.push({ fixed: false, label: BLOCK_TIMES[2].label, time: BLOCK_TIMES[2].time, subject: letters[2] });
  rows.push({ fixed: false, label: BLOCK_TIMES[3].label, time: BLOCK_TIMES[3].time, subject: letters[3] });
  rows.push({ fixed: true, label: FIXED_PERIODS.athletics.label, time: FIXED_PERIODS.athletics.time });
  return rows;
}

function openModal(dateStr) {
  activeDateStr = dateStr;
  const backdrop = document.getElementById("modalBackdrop");
  document.getElementById("modalTitle").textContent = formatLongDate(dateStr);

  const bannerWrap = document.getElementById("termBanners");
  bannerWrap.innerHTML = "";
  for (const t of termsForDate(dateStr)) {
    const b = document.createElement("div");
    b.className = "term-banner";
    b.textContent = t.label;
    bannerWrap.appendChild(b);
  }

  const scheduleWrap = document.getElementById("scheduleWrap");
  const dayNum = DAY_ROTATION[dateStr];
  if (dayNum) {
    const rows = buildScheduleRows(dayNum);
    let html = `<table class="schedule-table"><tbody>`;
    for (const r of rows) {
      if (r.fixed) {
        html += `<tr class="fixed"><td>${r.label}${r.room ? " · " + FIXED_PERIODS.advisory.detail : ""}</td><td class="time">${r.time}</td><td class="room">${r.room || ""}</td></tr>`;
      } else {
        const subj = SUBJECTS[r.subject];
        html += `<tr><td>${r.label}: <strong>${subj.name}</strong></td><td class="time">${r.time}</td><td class="room">${subj.room}</td></tr>`;
      }
    }
    html += `</tbody></table>`;
    scheduleWrap.innerHTML = html;
  } else {
    scheduleWrap.innerHTML = `<div class="no-schedule">No class rotation on record for this date.</div>`;
  }

  renderModalNotes(dateStr);

  const nameInput = document.getElementById("noteAuthor");
  nameInput.value = localStorage.getItem("calendarName") || "";

  backdrop.classList.add("open");
}

function closeModal() {
  document.getElementById("modalBackdrop").classList.remove("open");
  activeDateStr = null;
}

function renderModalNotes(dateStr) {
  if (dateStr !== activeDateStr) return;
  const listEl = document.getElementById("notesList");
  const notes = notesByDate[dateStr] || [];
  if (!notes.length) {
    listEl.innerHTML = `<div class="empty-notes">No notes yet.</div>`;
    return;
  }
  listEl.innerHTML = notes.map((n) => {
    const when = new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const who = n.author ? n.author : "Someone";
    return `<div class="note-item">
      <div class="note-body">${escapeHtml(n.body)}<span class="note-meta">${escapeHtml(who)} · ${when}</span></div>
      <button class="del" data-id="${n.id}" title="Delete note">✕</button>
    </div>`;
  }).join("");

  listEl.querySelectorAll("button.del").forEach((btn) => {
    btn.addEventListener("click", () => deleteNote(btn.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function addNote() {
  const body = document.getElementById("noteBody").value.trim();
  const author = document.getElementById("noteAuthor").value.trim();
  if (!body || !activeDateStr) return;

  if (author) localStorage.setItem("calendarName", author);

  if (!supabaseClient) {
    document.getElementById("syncStatus").textContent = "Can't save — Supabase isn't configured yet.";
    return;
  }

  const btn = document.getElementById("addNoteBtn");
  btn.disabled = true;
  const { error } = await supabaseClient
    .from("notes")
    .insert({ note_date: activeDateStr, body, author: author || null });
  btn.disabled = false;

  if (error) {
    document.getElementById("syncStatus").textContent = "Couldn't save note: " + error.message;
    return;
  }
  document.getElementById("noteBody").value = "";
  await loadAllNotes();
}

async function deleteNote(id) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from("notes").delete().eq("id", id);
  if (error) {
    document.getElementById("syncStatus").textContent = "Couldn't delete note: " + error.message;
    return;
  }
  await loadAllNotes();
}

function goToMonth(offset) {
  current.setMonth(current.getMonth() + offset);
  renderCalendar();
}

function goToToday() {
  current = new Date();
  current.setDate(1);
  renderCalendar();
}

document.addEventListener("DOMContentLoaded", () => {
  initSupabase();
  renderCalendar();
  loadAllNotes();
  subscribeRealtime();

  document.getElementById("prevMonth").addEventListener("click", () => goToMonth(-1));
  document.getElementById("nextMonth").addEventListener("click", () => goToMonth(1));
  document.getElementById("todayBtn").addEventListener("click", goToToday);
  document.getElementById("closeModalBtn").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeModal();
  });
  document.getElementById("addNoteBtn").addEventListener("click", addNote);
});
