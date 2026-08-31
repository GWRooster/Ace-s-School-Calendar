/* ------------------------------------------------------------------
   SCHEDULE DATA
   Edit this file to add/update the school schedule. Nothing in here
   touches Supabase or notes — this is purely the class/day rotation
   info pulled from the school's schedule spreadsheet.
------------------------------------------------------------------- */

// Letter -> subject. Update names/rooms here if a class or room changes.
const SUBJECTS = {
  A: { name: "Science",     code: "SCI-8-A",    room: "Lab I" },
  B: { name: "Studio Arts", code: "STU ART-B1", room: "218" },
  C: { name: "History",     code: "HIS-8-C",    room: "207" },
  D: { name: "Algebra",     code: "ALG-8-D",    room: "219" },
  E: { name: "English",     code: "ENG-8-E",    room: "220" },
  F: { name: "Spanish II",  code: "SPA-II-F",   room: "150" },
  G: { name: "Shark Tank",  code: "SHARK-G1",   room: "211" },
};

// Rotation day (1-7) -> the 4 letters used for Block 1, Block 2, Block 3, Block 4 in order.
const DAY_LETTERS = {
  1: ["A", "B", "C", "D"],
  2: ["E", "F", "G", "A"],
  3: ["B", "C", "D", "E"],
  4: ["F", "G", "A", "B"],
  5: ["C", "D", "E", "F"],
  6: ["G", "A", "B", "C"],
  7: ["D", "E", "F", "G"],
};

// Fixed (non-rotating) parts of every school day.
const FIXED_PERIODS = {
  advisory:  { label: "Advisory / SH / Assembly", time: "8:20 – 8:45 AM",  room: "210", detail: "Woodward/Behrendt" },
  open:      { label: "Open",                     time: "10:00 – 10:30 AM" },
  lunch:     { label: "MS Lunch",                 time: "12:00 – 12:35 PM" },
  athletics: { label: "Athletics / Extracurriculars", time: "3:05 – 4:00 PM" },
};

// Block time slots, in order.
const BLOCK_TIMES = [
  { key: "block1", label: "Block 1", time: "8:50 – 10:00 AM" },
  { key: "block2", label: "Block 2", time: "10:35 – 11:55 AM" },
  { key: "block3", label: "Block 3", time: "12:40 – 1:50 PM" },
  { key: "block4", label: "Block 4", time: "1:55 – 3:00 PM" },
];

// date (YYYY-MM-DD) -> rotation day number (1-7).
// This is the day-by-day list from the school schedule spreadsheet.
// Currently covers 8/31/2026 - 12/15/2026, plus the first day of Term 3.
// Term 3 (after 1/5/27) and Term 4 are not yet filled in — add rows here
// the same way (e.g. "2027-01-06": 2,) once that part of the spreadsheet
// is available, and they'll show up on the calendar automatically.
const DAY_ROTATION = {
  "2026-08-31": 3,
  "2026-09-01": 4,
  "2026-09-02": 5,
  "2026-09-03": 6,
  "2026-09-04": 7,
  "2026-09-08": 1,
  "2026-09-09": 2,
  "2026-09-10": 3,
  "2026-09-11": 4,
  "2026-09-14": 5,
  "2026-09-15": 6,
  "2026-09-16": 7,
  "2026-09-18": 2,
  "2026-09-22": 3,
  "2026-09-23": 4,
  "2026-09-24": 5,
  "2026-09-25": 6,
  "2026-09-29": 1,
  "2026-09-30": 2,
  "2026-10-01": 3,
  "2026-10-02": 4,
  "2026-10-05": 5,
  "2026-10-06": 6,
  "2026-10-07": 7,
  "2026-10-08": 1,
  "2026-10-13": 2,
  "2026-10-14": 3,
  "2026-10-15": 4,
  "2026-10-16": 5,
  "2026-10-19": 6,
  "2026-10-20": 7,
  "2026-10-21": 1,
  "2026-10-22": 2,
  "2026-10-23": 3,
  "2026-10-26": 4,
  "2026-10-27": 5,
  "2026-10-28": 6,
  "2026-10-29": 7,
  "2026-11-03": 1,
  "2026-11-04": 2,
  "2026-11-05": 3,
  "2026-11-06": 4,
  "2026-11-09": 5,
  "2026-11-10": 6,
  "2026-11-11": 7,
  "2026-11-12": 1,
  "2026-11-13": 2,
  "2026-11-16": 3,
  "2026-11-17": 4,
  "2026-11-18": 5,
  "2026-11-19": 6,
  "2026-11-30": 7,
  "2026-12-01": 1,
  "2026-12-02": 2,
  "2026-12-03": 3,
  "2026-12-04": 4,
  "2026-12-07": 5,
  "2026-12-08": 6,
  "2026-12-09": 7,
  "2026-12-10": 1,
  "2026-12-11": 2,
  "2026-12-14": 3,
  "2026-12-15": 4,
  "2027-01-05": 1,
};

// Term / grading-period boundaries.
const TERMS = [
  { date: "2026-10-16", label: "Term 1 Ends",   type: "end" },
  { date: "2026-10-19", label: "Term 2 Begins", type: "begin" },
  { date: "2026-12-18", label: "Term 2 Ends",   type: "end" },
  { date: "2027-01-05", label: "Term 3 Begins", type: "begin" },
  { date: "2027-03-12", label: "Term 3 Ends",   type: "end" },
  { date: "2027-03-22", label: "Term 4 Begins", type: "begin" },
  { date: "2027-05-28", label: "Term 4 Ends",   type: "end" },
];
