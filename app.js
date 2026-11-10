/* ------------------------------------------------------------------
   ACE'S CALENDAR v2
   Week / month / day views for school, extracurricular and home items.
   Data lives in Supabase (see config.js + supabase-v2-setup.sql).
   The schedule (rotation days, subjects, terms) is edited from the
   Schedule screen in the app — no code changes needed.
------------------------------------------------------------------- */
(function () {
  'use strict';

  // ---------- constants ----------
  var SCHOOL_TYPES = ['Homework due', 'Assignment due', 'Quiz', 'Test', 'Project due'];
  var CAT_NAME = { school: 'School', act: 'Extracurricular', home: 'Home' };
  var REPEAT_NAME = { none: '', daily: 'daily', weekdays: 'weekdays', weekly: 'weekly' };
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // ---------- schedule config (built-in fallback = schedule-data.js) ----------
  var CFG = {
    subjects: {},
    dayLetters: {},
    blocks: [
      { n: 1, start: '08:50', range: '8:50 – 10:00' }, { n: 2, start: '10:35', range: '10:35 – 11:55' },
      { n: 3, start: '12:40', range: '12:40 – 1:50' }, { n: 4, start: '13:55', range: '1:55 – 3:00' }
    ],
    fixed: [
      { label: 'Advisory / SH / Assembly', start: '08:20', range: '8:20 – 8:45', room: '210' },
      { label: 'Open', start: '10:00', range: '10:00 – 10:30' },
      { label: 'MS Lunch', start: '12:00', range: '12:00 – 12:35' },
      { label: 'Athletics / Extracurriculars', start: '15:05', range: '3:05 – 4:00' }
    ],
    terms: []
  };
  var ROT = {};
  try {
    /* globals from ../schedule-data.js */
    Object.keys(SUBJECTS).forEach(function (k) { CFG.subjects[k] = { name: SUBJECTS[k].name, room: SUBJECTS[k].room }; });
    CFG.dayLetters = JSON.parse(JSON.stringify(DAY_LETTERS));
    CFG.terms = TERMS.slice();
    ROT = Object.assign({}, DAY_ROTATION);
  } catch (e) { /* schedule-data.js not present; Supabase provides everything */ }

  var ITEMS = [];   // {id, cat, date, time, title, subject, type, details, repeat}
  var NOTES = [];   // {id, note_date, body, author, created_at}

  // ---------- dates ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function add(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function sunday(d) { return add(d, -d.getDay()); }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function fmtTime(t) { if (!t) return ''; var p = t.split(':'), h = +p[0], m = p[1]; var ap = h < 12 ? 'a' : 'p'; h = h % 12 || 12; return h + ':' + m + ap; }
  function shortDate(k) { var d = parse(k); return MON[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ', ' + d.getFullYear(); }
  var TODAY = key(new Date());

  function rotation(k) { return ROT[k] || null; }
  function termsFor(k) { return CFG.terms.filter(function (t) { return t.date === k; }).map(function (t) { return t.label; }); }
  function rotationCount() { return Object.keys(CFG.dayLetters).length || 7; }

  // ---------- prefs (this browser only) ----------
  function load(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  var prefs = load('aceCal.prefs') || {};
  var isIOSDevice = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  var S = {
    view: prefs.view || 'week',
    mode: prefs.mode || (isIOSDevice ? 'ios' : 'pc'),
    cursor: TODAY,
    open: null,        // date key of open day sheet
    sheet: null,       // 'signin' | 'schedule' | null
    cat: 'school',
    pendingDel: null,
    parsed: null,      // parsed rotation rows awaiting save
    busy: false
  };
  if (prefs.theme) document.documentElement.setAttribute('data-theme', prefs.theme);
  function persistPrefs() { save('aceCal.prefs', { view: S.view, mode: S.mode, theme: document.documentElement.getAttribute('data-theme') || '' }); }

  // ---------- Supabase ----------
  var sb = null, session = null;
  function configured() {
    return typeof SUPABASE_URL === 'string' && typeof SUPABASE_KEY === 'string' &&
      SUPABASE_URL.indexOf('PASTE_') < 0 && SUPABASE_KEY.indexOf('PASTE_') < 0;
  }
  function setStatus(msg, isErr) {
    var el = $('status'); $('statusTxt').textContent = msg;
    el.classList.toggle('err', !!isErr);
  }
  function fromRow(r) {
    return { id: r.id, cat: r.cat, date: r.item_date, time: r.time || '', title: r.title || '', subject: r.subject || '', type: r.type || '', details: r.details || '', repeat: r.repeat || 'none' };
  }

  async function loadAll() {
    if (!sb) { setStatus('Not connected — showing the built-in schedule. Changes cannot be saved.', true); render(); return; }
    var res = await Promise.all([
      sb.from('schedule_config').select('*'),
      sb.from('schedule_days').select('*'),
      sb.from('items').select('*'),
      sb.from('notes').select('*').order('created_at', { ascending: true })
    ]);
    var err = res.find(function (r) { return r.error; });
    if (err) {
      var m = err.error.message || 'unknown error';
      setStatus(/does not exist|schema cache/i.test(m)
        ? 'Database tables are missing — run supabase-v2-setup.sql in the Supabase SQL Editor.'
        : 'Could not load data: ' + m, true);
      render(); return;
    }
    res[0].data.forEach(function (row) {
      if (row.key === 'subjects') CFG.subjects = row.value;
      if (row.key === 'day_letters') CFG.dayLetters = row.value;
      if (row.key === 'blocks') CFG.blocks = row.value;
      if (row.key === 'fixed') CFG.fixed = row.value;
      if (row.key === 'terms') CFG.terms = row.value;
    });
    if (res[1].data.length) { ROT = {}; res[1].data.forEach(function (r) { ROT[r.day_date] = r.rotation; }); }
    ITEMS = res[2].data.map(fromRow);
    NOTES = res[3].data;
    setStatus('Live · synced across devices');
    render();
  }

  var reloadTimer;
  function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(loadAll, 250); }
  function subscribe() {
    if (!sb) return;
    var ch = sb.channel('ace-calendar');
    ['items', 'notes', 'schedule_days', 'schedule_config'].forEach(function (t) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, scheduleReload);
    });
    ch.subscribe();
  }

  // ---------- occurrence logic ----------
  function occurs(it, k) {
    if (k < it.date) return false;
    if (!it.repeat || it.repeat === 'none') return it.date === k;
    var d = parse(k).getDay();
    if (it.repeat === 'daily') return true;
    if (it.repeat === 'weekdays') return d > 0 && d < 6;
    if (it.repeat === 'weekly') return parse(it.date).getDay() === d;
    return false;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function subjName(L) { return CFG.subjects[L] ? CFG.subjects[L].name : L; }

  // Full ordered day: fixed periods + blocks (green when something is attached) + items
  function dayEntries(k) {
    var rot = rotation(k), out = [], letters = rot ? (CFG.dayLetters[rot] || []) : [];
    var school = ITEMS.filter(function (i) { return i.cat === 'school' && occurs(i, k); });
    if (rot) {
      CFG.fixed.forEach(function (f) { out.push({ kind: 'fixed', time: f.start, range: f.range, room: f.room, label: f.label, due: false }); });
      CFG.blocks.forEach(function (b) {
        var L = letters[b.n - 1]; if (!L) return;
        var sub = CFG.subjects[L] || { name: L, room: '' };
        var att = school.filter(function (i) { return i.subject === L; });
        out.push({ kind: 'block', time: b.start, range: b.range, room: sub.room, label: 'Block ' + b.n + ' · ' + sub.name, due: att.length > 0, attached: att });
      });
    }
    school.filter(function (i) { return !i.subject || letters.indexOf(i.subject) < 0; }).forEach(function (i) {
      var nm = i.subject ? subjName(i.subject) + ' · ' : '';
      out.push({ kind: 'item', item: i, time: i.time || '', label: nm + i.type + (i.details ? ' · ' + i.details : ''), cat: 'school', due: true });
    });
    ITEMS.filter(function (i) { return i.cat !== 'school' && occurs(i, k); }).forEach(function (i) {
      out.push({ kind: 'item', item: i, time: i.time || '', label: i.title, cat: i.cat, due: false });
    });
    out.sort(function (a, b) { return (a.time || '99:99').localeCompare(b.time || '99:99'); });
    return out;
  }
  function notesFor(k) { return NOTES.filter(function (n) { return n.note_date === k; }); }

  // ---------- render: toolbar ----------
  var $ = function (id) { return document.getElementById(id); };
  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function renderBar() {
    var c = parse(S.cursor);
    if (S.view === 'week') {
      var s = sunday(c), e = add(s, 6);
      $('range').textContent = s.getMonth() === e.getMonth()
        ? MON[s.getMonth()].slice(0, 3) + ' ' + s.getDate() + ' – ' + e.getDate() + ', ' + e.getFullYear()
        : MON[s.getMonth()].slice(0, 3) + ' ' + s.getDate() + ' – ' + MON[e.getMonth()].slice(0, 3) + ' ' + e.getDate() + ', ' + e.getFullYear();
    } else $('range').textContent = MON[c.getMonth()] + ' ' + c.getFullYear();
    $('vWeek').setAttribute('aria-pressed', S.view === 'week');
    $('vMonth').setAttribute('aria-pressed', S.view === 'month');
    $('mPC').setAttribute('aria-pressed', S.mode === 'pc');
    $('mIOS').setAttribute('aria-pressed', S.mode === 'ios');
    var pc = S.mode === 'pc';
    $('addLbl').textContent = pc ? 'Add item' : 'Add note';
    $('modePill').hidden = pc;
    $('kbHint').hidden = !pc;
    $('signInBtn').hidden = !pc || !!session || !sb;
    $('whoChip').hidden = !pc || !session;
    $('schedBtn').hidden = !pc || !session;
    $('themeLbl').textContent = isDark() ? 'Light' : 'Dark';
    var lg = '';
    for (var r = 1; r <= rotationCount(); r++) lg += '<span class="rp r' + r + ' sm">Day ' + r + '</span>';
    $('legendDays').innerHTML = lg;
  }
  function pill(rot, size) {
    var sz = size ? ' ' + size : '';
    return rot ? '<span class="rp r' + rot + sz + '">Day ' + rot + '</span>' : '<span class="rp none' + sz + '">No school</span>';
  }
  var NOTE_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z"/></svg>';

  // ---------- render: week ----------
  function renderWeek() {
    var s = sunday(parse(S.cursor)), h = '<div class="week">';
    for (var i = 0; i < 7; i++) {
      var d = add(s, i), k = key(d), rot = rotation(k), ents = dayEntries(k), nn = notesFor(k).length;
      h += '<div class="col' + (rot ? ' r' + rot : '') + (k === TODAY ? ' today' : '') + '" data-open="' + k + '" role="button" tabindex="0" aria-label="Open ' + DOW_LONG[d.getDay()] + ' ' + MON[d.getMonth()] + ' ' + d.getDate() + '">';
      h += '<div class="col-head"><div class="top"><div class="d"><span class="num">' + d.getDate() + '</span><span class="dow">' + DOW[i] + '</span></div>' + pill(rot) + '</div>';
      termsFor(k).forEach(function (t) { h += '<span class="term-line">' + esc(t) + '</span>'; });
      if (nn) h += '<span class="notes-pill">' + NOTE_ICON + nn + ' note' + (nn > 1 ? 's' : '') + '</span>';
      h += '</div><div class="items">';
      if (!ents.length) h += '<div class="empty">Nothing scheduled</div>';
      ents.forEach(function (e) {
        var cat = e.kind === 'item' ? e.cat : 'school';
        h += '<div class="row' + (e.due ? ' due' : '') + (e.kind === 'fixed' ? ' fixed' : '') + '"><span class="t">' + fmtTime(e.time) + '</span><div class="body">';
        h += '<div class="lbl"><span class="dot ' + cat + '"></span><span>' + esc(e.label) + '</span></div>';
        if (e.kind === 'block' && e.due) e.attached.forEach(function (a) { h += '<span class="badge" style="margin-left:13px">' + esc(a.type) + '</span>'; });
        h += '</div></div>';
      });
      h += '</div></div>';
    }
    return h + '</div>';
  }

  // ---------- render: month ----------
  function renderMonth() {
    var c = parse(S.cursor), first = new Date(c.getFullYear(), c.getMonth(), 1), start = sunday(first);
    var last = new Date(c.getFullYear(), c.getMonth() + 1, 0), cells = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
    var h = '<div class="month"><div class="mhead">' + DOW.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div><div class="mgrid">';
    for (var i = 0; i < cells; i++) {
      var d = add(start, i), k = key(d), out = d.getMonth() !== c.getMonth(), rot = rotation(k);
      var chips = [];
      dayEntries(k).forEach(function (e) {
        if (e.kind === 'block') e.attached.forEach(function (a) { chips.push({ due: true, cat: 'school', label: subjName(a.subject) + ' · ' + a.type }); });
        else if (e.kind === 'item') chips.push({ due: e.due, cat: e.cat, label: e.label });
      });
      termsFor(k).forEach(function (t) { chips.unshift({ due: false, cat: 'school', label: t, term: true }); });
      chips.sort(function (a, b) { return (b.due ? 1 : 0) - (a.due ? 1 : 0); });
      var nn = notesFor(k).length; if (nn) chips.push({ due: false, cat: 'school', label: nn + ' note' + (nn > 1 ? 's' : '') });
      var more = chips.length - 3;
      h += '<button class="cell' + (out ? ' out' : '') + (k === TODAY ? ' today' : '') + '" data-open="' + k + '" aria-label="Open ' + MON[d.getMonth()] + ' ' + d.getDate() + '">';
      h += '<div class="in"><div class="top"><span class="n">' + d.getDate() + '</span>' + (rot ? pill(rot, 'sm') : '') + '</div>';
      chips.slice(0, 3).forEach(function (ch) { h += '<span class="chip' + (ch.due ? ' due' : '') + '"><span class="dot ' + ch.cat + '" style="width:6px;height:6px"></span>' + esc(ch.label) + '</span>'; });
      if (more > 0) h += '<span class="more">+' + more + ' more</span>';
      h += '</div></button>';
    }
    return h + '</div></div>';
  }

  // ---------- shared sheet chrome ----------
  var X_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  function closeBtn(label) { return '<button class="btn icon" data-close="1" aria-label="' + label + '">' + X_ICON + '</button>'; }
  function delBtn(obj, kind) {
    var armed = S.pendingDel === obj.id;
    var series = obj.repeat && obj.repeat !== 'none';
    return '<button type="button" class="x' + (armed ? ' confirm' : '') + '" data-del="' + obj.id + '" data-kind="' + (kind || 'item') + '">' + (armed ? (series ? 'Delete series?' : 'Delete?') : 'Remove') + '</button>';
  }

  // ---------- render: day sheet ----------
  function daySheet() {
    var k = S.open, d = parse(k), rot = rotation(k), ents = dayEntries(k), notes = notesFor(k), pc = S.mode === 'pc', canEdit = pc && !!session;
    var h = '<div class="scrim" data-close="1"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">';
    h += '<div class="sheet-band' + (rot ? ' r' + rot : '') + '"><div class="ttl">';
    h += '<button class="btn icon" data-day="-1" aria-label="Previous day"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>';
    h += '<h2 id="sheetTitle">' + DOW_LONG[d.getDay()] + ' ' + MON[d.getMonth()].slice(0, 3) + ' ' + ordinal(d.getDate()) + '</h2>' + pill(rot, 'lg');
    termsFor(k).forEach(function (t) { h += '<span class="rp lg term">' + esc(t) + '</span>'; });
    h += '<button class="btn icon" data-day="1" aria-label="Next day"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>';
    h += '</div>' + closeBtn('Close day view') + '</div>';

    h += '<div class="sheet-body"><div class="panel"><div class="panel-h"><h3>Full day</h3><span class="hint">' + ents.filter(function (e) { return e.due; }).length + ' due · ' + ents.length + ' items</span></div><div class="panel-b">';
    if (!ents.length) h += '<div class="empty">Nothing scheduled.' + (canEdit ? ' Add the first item with the form.' : '') + '</div>';
    ents.forEach(function (e) {
      var cat = e.kind === 'item' ? e.cat : 'school';
      h += '<div class="drow' + (e.due ? ' due' : '') + (e.kind === 'fixed' ? ' fixed' : '') + '"><span class="t">' + esc(e.range || fmtTime(e.time)) + '</span><div class="main">';
      h += '<span class="name"><span class="dot ' + cat + '"></span>' + esc(e.label) + '</span>';
      if (e.kind === 'block') e.attached.forEach(function (a) {
        h += '<span class="det"><span class="badge">' + esc(a.type) + '</span> ' + esc(a.details || '') + (canEdit ? ' ' + delBtn(a) : '') + '</span>';
      });
      h += '</div><span class="meta">';
      if (e.kind === 'block') h += (e.room ? 'Rm ' + esc(e.room) : '') + (e.due ? '' : (e.room ? ' · ' : '') + 'Nothing due');
      else if (e.kind === 'fixed') h += e.room ? 'Rm ' + esc(e.room) : '';
      else {
        var it = e.item; h += CAT_NAME[it.cat] + (REPEAT_NAME[it.repeat] ? ' · ' + REPEAT_NAME[it.repeat] : '');
        if (canEdit) h += delBtn(it);
      }
      h += '</span></div>';
    });
    h += '</div></div><div class="side">';

    if (pc) {
      h += '<div class="panel"><div class="panel-h"><h3>Add item</h3></div>';
      if (!session) {
        h += '<div class="locked">' + (sb ? 'Sign in as Ace to add assignments, activities and home tasks.<button type="button" class="btn primary" data-signin="1">Sign in</button>' : 'Not connected to the database, so items cannot be saved.') + '</div>';
      } else {
        h += '<form class="add" id="addForm" novalidate>';
        h += '<div class="cats" role="group" aria-label="Category">' + [['school', 'School'], ['act', 'Extracurricular'], ['home', 'Home']].map(function (c) { return '<button type="button" data-cat="' + c[0] + '" aria-pressed="' + (S.cat === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>';
        if (S.cat === 'school') {
          var letters = rot ? (CFG.dayLetters[rot] || []) : [];
          h += '<div class="two"><label class="field" for="fBlock">Attach to class<select id="fBlock">';
          CFG.blocks.forEach(function (b) { var L = letters[b.n - 1]; if (L) h += '<option value="' + L + '">Block ' + b.n + ' · ' + esc(subjName(L)) + '</option>'; });
          h += '<option value="">No block (set a time)</option></select></label>';
          h += '<label class="field" for="fType">Type<select id="fType">' + SCHOOL_TYPES.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></label></div>';
          h += '<label class="field" for="fDetails">Details<input id="fDetails" type="text" placeholder="e.g. Workbook p. 42–44" autocomplete="off"></label>';
          h += '<label class="field" for="fTime">Time<input id="fTime" type="time"' + (letters.length ? ' disabled' : '') + '></label>';
        } else {
          h += '<label class="field" for="fTitle">' + (S.cat === 'act' ? 'Activity' : 'Task') + '<input id="fTitle" type="text" placeholder="' + (S.cat === 'act' ? 'e.g. Soccer practice' : 'e.g. Empty dishwasher') + '" autocomplete="off"></label>';
          h += '<div class="two"><label class="field" for="fTime">Time<input id="fTime" type="time"></label>';
          h += '<label class="field" for="fRepeat">Repeat<select id="fRepeat"><option value="none">Never</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option></select></label></div>';
        }
        h += '<div class="err" id="fErr" role="alert"></div><div class="actions"><button type="reset" class="btn">Clear</button><button type="submit" class="btn primary">Save to ' + MON[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + '</button></div></form>';
      }
      h += '</div>';
    }

    h += '<div class="panel" style="flex:1 1 0;min-height:220px"><div class="panel-h"><h3>Notes</h3><span class="hint">' + notes.length + '</span></div><div class="panel-b">';
    if (!notes.length) h += '<div class="empty">No notes for this day.</div>';
    notes.forEach(function (n) {
      var when = new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      h += '<div class="note"><span class="who"><span>' + esc(n.author || 'Someone') + ' · ' + when + '</span>' + delBtn(n, 'note') + '</span><span class="txt">' + esc(n.body) + '</span></div>';
    });
    var defName = session ? 'Ace' : (load('aceCal.name') || '');
    h += '<form id="noteForm" style="display:flex;flex-direction:column;gap:8px">';
    h += '<div class="note-add"><textarea id="fNote" placeholder="Add a note…" aria-label="New note"></textarea></div>';
    h += '<div class="note-add"><input id="fAuthor" type="text" value="' + esc(defName) + '" placeholder="Name (optional)" aria-label="Name" style="flex:1;min-width:0;height:40px;border-radius:10px;border:1px solid var(--field-line);background:var(--field);padding:0 10px;font-size:14px;color:var(--fg)"><button type="submit" class="btn">Add note</button></div>';
    h += '</form></div></div></div></div></div></div>';
    return h;
  }

  // ---------- render: sign-in sheet ----------
  function signInSheet() {
    var h = '<div class="scrim" data-close="1"><div class="sheet small-sheet" role="dialog" aria-modal="true" aria-labelledby="siTitle">';
    h += '<div class="sheet-band"><div class="ttl"><h2 id="siTitle" style="font-size:24px">Sign in</h2></div>' + closeBtn('Close sign in') + '</div>';
    h += '<form id="signInForm" class="pad" novalidate>';
    h += '<p class="hint" style="margin:0">Signing in lets Ace add and edit items and update the school schedule. Viewing and notes work without signing in.</p>';
    h += '<label class="field" for="siEmail">Email<input id="siEmail" type="email" autocomplete="username" required></label>';
    h += '<label class="field" for="siPass">Password<input id="siPass" type="password" autocomplete="current-password" required></label>';
    h += '<div class="err" id="siErr" role="alert"></div>';
    h += '<div class="actions"><button type="submit" class="btn primary">Sign in</button></div></form></div></div>';
    return h;
  }

  // ---------- render: schedule sheet ----------
  function scheduleSheet() {
    var dates = Object.keys(ROT).sort();
    var h = '<div class="scrim" data-close="1"><div class="sheet wide-sheet" role="dialog" aria-modal="true" aria-labelledby="scTitle">';
    h += '<div class="sheet-band"><div class="ttl"><h2 id="scTitle" style="font-size:24px">School schedule</h2></div>' + closeBtn('Close schedule') + '</div><div class="pad">';

    h += '<section class="sect"><h3>Rotation days</h3>';
    h += '<p>Currently loaded: <b>' + dates.length + ' school days</b>' + (dates.length ? ', ' + shortDate(dates[0]) + ' – ' + shortDate(dates[dates.length - 1]) : '') + '. To add or change dates, upload the school\'s spreadsheet (Excel or CSV) or paste rows below. Each row needs a date and a day number, e.g. <code>1/6/2027, Day 2</code>. Existing dates are updated; other dates stay as they are.</p>';
    h += '<label class="drop" id="drop" for="fFile">Drop an Excel or CSV file here, or click to choose one<input id="fFile" type="file" accept=".xlsx,.xls,.csv,.txt" hidden></label>';
    h += '<label class="field" for="fPaste">Or paste rows<textarea id="fPaste" class="mono" placeholder="2027-01-06	2&#10;1/7/2027, Day 3"></textarea></label>';
    h += '<div class="actions" style="justify-content:flex-start"><button type="button" class="btn" data-act="preview">Preview</button>';
    if (S.parsed && S.parsed.rows.length) h += '<button type="button" class="btn primary" data-act="saveRot"' + (S.busy ? ' disabled' : '') + '>Save ' + S.parsed.rows.length + ' days</button>';
    h += '</div><div class="preview" id="preview">' + previewHTML() + '</div></section>';

    h += '<section class="sect"><h3>Term dates</h3><p>One per line: date, then label. Labels containing "Begins" mark a start.</p>';
    h += '<label class="field" for="fTerms">Terms<textarea id="fTerms" class="mono">' + esc(CFG.terms.map(function (t) { return t.date + ', ' + t.label; }).join('\n')) + '</textarea></label>';
    h += '<div class="actions" style="justify-content:flex-start"><button type="button" class="btn primary" data-act="saveTerms">Save terms</button></div></section>';

    h += '<section class="sect"><h3>Classes and rooms</h3><p>The rotation uses letters A–G. Rename a class or change a room here.</p><div class="subj-grid">';
    Object.keys(CFG.subjects).sort().forEach(function (L) {
      var s = CFG.subjects[L];
      h += '<b>' + L + '</b><input data-subj="' + L + '" data-f="name" value="' + esc(s.name) + '" aria-label="Class ' + L + ' name"><input data-subj="' + L + '" data-f="room" value="' + esc(s.room) + '" aria-label="Class ' + L + ' room">';
    });
    h += '</div><div class="actions" style="justify-content:flex-start"><button type="button" class="btn primary" data-act="saveSubj">Save classes</button></div></section>';

    if (typeof OLD_SUPABASE_URL === 'string' && OLD_SUPABASE_URL) {
      h += '<section class="sect"><h3>Copy notes from the original calendar</h3><p>One-time step: brings notes written in the original iOS calendar into this one. Running it twice does not create duplicates.</p>';
      h += '<div class="actions" style="justify-content:flex-start"><button type="button" class="btn" data-act="copyNotes"' + (S.busy ? ' disabled' : '') + '>Copy notes</button></div></section>';
    }
    h += '<p class="hint">Block times and fixed periods are stored in Supabase → Table Editor → schedule_config.</p>';
    h += '</div></div></div>';
    return h;
  }

  // ---------- render all ----------
  function render() {
    renderBar();
    $('board').innerHTML = S.view === 'week' ? renderWeek() : renderMonth();
    renderSheet();
  }
  function renderSheet(keepFocus) {
    var root = $('sheetRoot');
    var scrollTop = 0, old = root.querySelector('.pad, .panel-b');
    if (old) scrollTop = old.scrollTop;
    if (S.sheet === 'signin') root.innerHTML = signInSheet();
    else if (S.sheet === 'schedule') root.innerHTML = scheduleSheet();
    else if (S.open) root.innerHTML = daySheet();
    else { root.innerHTML = ''; return; }
    var nw = root.querySelector('.pad, .panel-b'); if (nw && keepFocus) nw.scrollTop = scrollTop;
    if (!keepFocus) {
      var f = S.sheet === 'signin' ? $('siEmail') : S.sheet ? null : $(S.mode === 'pc' && session ? (S.cat === 'school' ? 'fDetails' : 'fTitle') : 'fNote');
      if (f) f.focus();
    }
    var bs = $('fBlock'); if (bs) bs.addEventListener('change', function () { $('fTime').disabled = !!bs.value; });
    var drop = $('drop');
    if (drop) {
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
      $('fFile').addEventListener('change', function (e) { if (e.target.files[0]) readFile(e.target.files[0]); });
    }
  }

  // ---------- schedule import ----------
  function dateFromCell(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) { var x = new Date(v.getTime() + 12 * 3600e3); return key(new Date(x.getFullYear(), x.getMonth(), x.getDate())); }
    if (typeof v === 'number' && v > 30000 && v < 80000) {
      var u = new Date(Math.round((v - 25569) * 86400e3));
      return u.getUTCFullYear() + '-' + pad(u.getUTCMonth() + 1) + '-' + pad(u.getUTCDate());
    }
    if (typeof v !== 'string') return null;
    var s = v.trim().replace(/^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+/i, '');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return y + '-' + pad(+m[1]) + '-' + pad(+m[2]); }
    if (/[a-z]/i.test(s) && /\d{4}/.test(s)) { var p = new Date(s); if (!isNaN(p)) return key(p); }
    return null;
  }
  function rotFromCell(v) {
    var max = rotationCount();
    if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= max ? v : null;
    if (typeof v !== 'string') return null;
    var m = v.trim().match(/^(?:day\s*)?(\d)$/i);
    return m && +m[1] >= 1 && +m[1] <= max ? +m[1] : null;
  }
  function rowsFromGrid(grid) {
    var out = {}, skipped = 0;
    grid.forEach(function (cells) {
      if (!cells || !cells.length) return;
      var dk = null, rv = null, di = -1;
      for (var i = 0; i < cells.length; i++) { dk = dateFromCell(cells[i]); if (dk) { di = i; break; } }
      if (dk) for (var j = 0; j < cells.length; j++) { if (j === di) continue; rv = rotFromCell(cells[j]); if (rv) break; }
      if (dk && rv) out[dk] = rv; else if (cells.some(function (c) { return c !== '' && c != null; })) skipped++;
    });
    var rows = Object.keys(out).sort().map(function (k) { return { date: k, rot: out[k] }; });
    return { rows: rows, skipped: skipped };
  }
  function gridFromText(txt) {
    return txt.split(/\r?\n/).map(function (line) {
      if (line.indexOf('\t') >= 0) return line.split('\t');
      var parts = line.split(/[;,]/).map(function (p) { return p.trim(); });
      // keep "January 6, 2027" together
      var joined = [];
      for (var i = 0; i < parts.length; i++) {
        if (/^\d{4}$/.test(parts[i]) && joined.length && /[a-z]/i.test(joined[joined.length - 1])) joined[joined.length - 1] += ', ' + parts[i];
        else joined.push(parts[i]);
      }
      return joined;
    });
  }
  function readFile(file) {
    var reader = new FileReader();
    var isText = /\.(csv|txt)$/i.test(file.name);
    reader.onload = function () {
      try {
        var grid;
        if (!isText && window.XLSX) {
          var wb = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true });
          grid = [];
          wb.SheetNames.forEach(function (n) { grid = grid.concat(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' })); });
        } else if (!isText) {
          toast('The spreadsheet reader has not loaded yet. Try again in a moment.'); return;
        } else grid = gridFromText(reader.result);
        S.parsed = rowsFromGrid(grid); S.parsed.source = file.name;
        renderSheet(true);
      } catch (e) { S.parsed = { rows: [], skipped: 0, error: 'Could not read that file: ' + e.message }; renderSheet(true); }
    };
    if (isText) reader.readAsText(file); else reader.readAsArrayBuffer(file);
  }
  function previewHTML() {
    var p = S.parsed; if (!p) return '';
    if (p.error) return '<span class="err">' + esc(p.error) + '</span>';
    if (!p.rows.length) return '<span class="err">No rows with both a date and a day number (1–' + rotationCount() + ') were found.</span>';
    var added = 0, changed = 0;
    p.rows.forEach(function (r) { if (!ROT[r.date]) added++; else if (ROT[r.date] !== r.rot) changed++; });
    var h = '<div class="banner"><b>' + p.rows.length + ' school days found</b>' + (p.source ? ' in ' + esc(p.source) : '') + ', ' + shortDate(p.rows[0].date) + ' – ' + shortDate(p.rows[p.rows.length - 1].date) + '. ' + added + ' new, ' + changed + ' changed, ' + (p.rows.length - added - changed) + ' already correct' + (p.skipped ? '. ' + p.skipped + ' rows skipped (no date or day number).' : '.') + '</div>';
    h += '<table><tbody>';
    p.rows.slice(0, 8).forEach(function (r) { h += '<tr><td>' + DOW[parse(r.date).getDay()] + ' ' + shortDate(r.date) + '</td><td>' + pill(r.rot, 'sm') + '</td><td class="hint">' + (!ROT[r.date] ? 'new' : ROT[r.date] !== r.rot ? 'was Day ' + ROT[r.date] : '') + '</td></tr>'; });
    if (p.rows.length > 8) h += '<tr><td class="hint" colspan="3">… and ' + (p.rows.length - 8) + ' more</td></tr>';
    return h + '</tbody></table>';
  }
  async function saveRotation() {
    var rows = S.parsed.rows.map(function (r) { return { day_date: r.date, rotation: r.rot }; });
    S.busy = true; renderSheet(true);
    for (var i = 0; i < rows.length; i += 200) {
      var res = await sb.from('schedule_days').upsert(rows.slice(i, i + 200), { onConflict: 'day_date' });
      if (res.error) { S.busy = false; toast('Not saved: ' + res.error.message); renderSheet(true); return; }
    }
    S.busy = false; S.parsed = null;
    await loadAll(); toast(rows.length + ' school days saved');
  }
  async function saveConfig(k, v, msg) {
    var res = await sb.from('schedule_config').upsert({ key: k, value: v }, { onConflict: 'key' });
    if (res.error) { toast('Not saved: ' + res.error.message); return; }
    await loadAll(); toast(msg);
  }
  async function copyOldNotes() {
    S.busy = true; renderSheet(true);
    try {
      var old = window.supabase.createClient(OLD_SUPABASE_URL, OLD_SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'aceCal-old' } });
      var res = await old.from('notes').select('*');
      if (res.error) throw new Error(res.error.message);
      var have = {}; NOTES.forEach(function (n) { have[n.note_date + '|' + n.body + '|' + new Date(n.created_at).getTime()] = 1; });
      var fresh = res.data.filter(function (n) { return !have[n.note_date + '|' + n.body + '|' + new Date(n.created_at).getTime()]; })
        .map(function (n) { return { note_date: n.note_date, body: n.body, author: n.author, created_at: n.created_at }; });
      if (fresh.length) { var ins = await sb.from('notes').insert(fresh); if (ins.error) throw new Error(ins.error.message); }
      S.busy = false; await loadAll();
      toast(fresh.length ? fresh.length + ' notes copied' : 'All original notes are already here');
    } catch (e) { S.busy = false; renderSheet(true); toast('Copy failed: ' + e.message); }
  }

  // ---------- toast ----------
  var tt;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 2400); }

  // ---------- events: toolbar ----------
  function shift(n) {
    var c = parse(S.cursor);
    S.cursor = key(S.view === 'week' ? add(c, 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1));
    render();
  }
  function openDay(k) { S.open = k; S.sheet = null; S.pendingDel = null; render(); }
  function closeSheet() { if (S.sheet) S.sheet = null; else S.open = null; S.pendingDel = null; S.parsed = null; render(); }

  $('prev').onclick = function () { shift(-1); };
  $('next').onclick = function () { shift(1); };
  $('today').onclick = function () { S.cursor = TODAY; render(); };
  $('vWeek').onclick = function () { S.view = 'week'; persistPrefs(); render(); };
  $('vMonth').onclick = function () { S.view = 'month'; persistPrefs(); render(); };
  $('mPC').onclick = function () { S.mode = 'pc'; persistPrefs(); render(); };
  $('mIOS').onclick = function () { S.mode = 'ios'; persistPrefs(); render(); };
  $('theme').onclick = function () { document.documentElement.setAttribute('data-theme', isDark() ? 'light' : 'dark'); persistPrefs(); renderBar(); };
  $('addBtn').onclick = function () { openDay(S.open || TODAY); };
  $('signInBtn').onclick = function () { S.sheet = 'signin'; render(); };
  $('schedBtn').onclick = function () { S.sheet = 'schedule'; S.parsed = null; render(); };
  $('whoChip').onclick = async function () { if (sb) await sb.auth.signOut(); toast('Signed out'); };

  $('board').addEventListener('click', function (e) { var el = e.target.closest('[data-open]'); if (el) openDay(el.getAttribute('data-open')); });
  $('board').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.col')) { e.preventDefault(); openDay(e.target.getAttribute('data-open')); } });

  // ---------- events: sheets ----------
  $('sheetRoot').addEventListener('click', async function (e) {
    var t = e.target;
    if (t.matches('.scrim') || t.closest('button[data-close]')) { closeSheet(); return; }
    if (t.closest('[data-signin]')) { S.sheet = 'signin'; render(); return; }
    var dd = t.closest('[data-day]');
    if (dd) { var nk = key(add(parse(S.open), +dd.getAttribute('data-day'))); S.open = nk; S.cursor = nk; S.pendingDel = null; render(); return; }
    var c = t.closest('[data-cat]'); if (c) { S.cat = c.getAttribute('data-cat'); renderSheet(); return; }
    var act = t.closest('[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'preview') { S.parsed = rowsFromGrid(gridFromText($('fPaste').value)); S.parsed.source = ''; renderSheet(true); }
      if (a === 'saveRot') saveRotation();
      if (a === 'copyNotes') copyOldNotes();
      if (a === 'saveTerms') {
        var terms = [], bad = 0;
        $('fTerms').value.split(/\r?\n/).forEach(function (line) {
          if (!line.trim()) return;
          var i = line.indexOf(','), dk = dateFromCell(line.slice(0, i).trim()), label = line.slice(i + 1).trim();
          if (i < 0 || !dk || !label) { bad++; return; }
          terms.push({ date: dk, label: label, type: /begin/i.test(label) ? 'begin' : 'end' });
        });
        if (bad) { toast(bad + ' line(s) need a date, a comma, then a label'); return; }
        terms.sort(function (x, y) { return x.date.localeCompare(y.date); });
        saveConfig('terms', terms, 'Terms saved');
      }
      if (a === 'saveSubj') {
        var subj = JSON.parse(JSON.stringify(CFG.subjects));
        document.querySelectorAll('[data-subj]').forEach(function (inp) { subj[inp.getAttribute('data-subj')][inp.getAttribute('data-f')] = inp.value.trim(); });
        saveConfig('subjects', subj, 'Classes saved');
      }
      return;
    }
    var del = t.closest('[data-del]');
    if (del) {
      var id = del.getAttribute('data-del'), kind = del.getAttribute('data-kind');
      if (S.pendingDel !== id) { S.pendingDel = id; renderSheet(true); return; }
      S.pendingDel = null;
      var res = await sb.from(kind === 'note' ? 'notes' : 'items').delete().eq('id', id);
      if (res.error) { toast('Not removed: ' + res.error.message); renderSheet(true); return; }
      await loadAll(); toast('Removed'); return;
    }
    if (S.pendingDel) { S.pendingDel = null; renderSheet(true); }
  });

  $('sheetRoot').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target;
    if (f.id === 'signInForm') {
      var email = $('siEmail').value.trim(), pass = $('siPass').value;
      if (!email || !pass) { $('siErr').textContent = 'Enter the email and password.'; return; }
      var r = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (r.error) { $('siErr').textContent = /invalid/i.test(r.error.message) ? 'Email or password is incorrect.' : r.error.message; return; }
      S.sheet = null; render(); toast('Signed in'); return;
    }
    if (f.id === 'addForm') {
      var row = { cat: S.cat, item_date: S.open, repeat: 'none' }, err = '';
      if (S.cat === 'school') {
        var b = $('fBlock').value; row.type = $('fType').value; row.details = $('fDetails').value.trim();
        if (b) row.subject = b; else { row.time = $('fTime').value; if (!row.time) err = 'Pick a time, or attach the item to a class.'; }
      } else {
        row.title = $('fTitle').value.trim(); row.time = $('fTime').value; row.repeat = $('fRepeat').value;
        if (!row.title) err = 'Enter a name for the ' + (S.cat === 'act' ? 'activity' : 'task') + '.';
        else if (!row.time) err = 'Pick a time so it sorts into the day.';
      }
      if (err) { $('fErr').textContent = err; return; }
      var ins = await sb.from('items').insert(row);
      if (ins.error) { $('fErr').textContent = 'Not saved: ' + ins.error.message; return; }
      await loadAll(); toast('Saved'); return;
    }
    if (f.id === 'noteForm') {
      var txt = $('fNote').value.trim(), author = $('fAuthor').value.trim();
      if (!txt) return;
      if (!sb) { toast('Not connected, so the note cannot be saved.'); return; }
      if (author && !session) save('aceCal.name', author);
      var n = await sb.from('notes').insert({ note_date: S.open, body: txt, author: author || null });
      if (n.error) { toast('Note not saved: ' + n.error.message); return; }
      await loadAll(); toast('Note added');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && (S.open || S.sheet)) { closeSheet(); return; }
    var typing = /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '');
    if (typing || e.metaKey || e.ctrlKey || e.altKey || S.sheet) return;
    if (S.open) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { var nk = key(add(parse(S.open), e.key === 'ArrowLeft' ? -1 : 1)); S.open = nk; S.cursor = nk; render(); }
      return;
    }
    if (e.key === 'ArrowLeft') shift(-1);
    else if (e.key === 'ArrowRight') shift(1);
    else if ((e.key === 'n' || e.key === 'N') && S.mode === 'pc') { e.preventDefault(); openDay(TODAY); }
  });

  // ---------- start ----------
  render();
  if (configured() && window.supabase) {
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, storageKey: 'aceCal-auth' } });
      sb.auth.getSession().then(function (r) { session = r.data.session; render(); });
      sb.auth.onAuthStateChange(function (_evt, s) { session = s; render(); });
      loadAll(); subscribe();
    } catch (e) { setStatus('Could not connect to Supabase — check config.js.', true); }
  } else {
    setStatus('Not connected — fill in config.js. Showing the built-in schedule.', true);
  }
})();
