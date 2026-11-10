-- Ace's Calendar v2 — run once in the Household Planner project
-- Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run.
-- Safe to re-run: tables use "if not exists" and seed rows upsert.

create extension if not exists pgcrypto;

-- Calendar items Ace adds (School / Extracurricular / Home)
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  cat text not null check (cat in ('school','act','home')),
  item_date date not null,
  time text,
  title text,
  subject text,
  type text,
  details text,
  repeat text not null default 'none' check (repeat in ('none','daily','weekdays','weekly')),
  created_at timestamptz not null default now()
);
create index if not exists items_item_date_idx on items (item_date);

-- Notes (same shape as the original calendar)
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  note_date date not null,
  body text not null,
  author text,
  created_at timestamptz not null default now()
);
create index if not exists notes_note_date_idx on notes (note_date);
alter table notes add column if not exists slot text not null default 'am';

-- Rotation day for each school date (updated from the Schedule screen)
create table if not exists schedule_days (
  day_date date primary key,
  rotation int not null check (rotation between 1 and 7)
);

-- Subjects, block times, fixed periods and term dates
create table if not exists schedule_config (
  key text primary key,
  value jsonb not null
);

-- Row Level Security
-- Anyone with the link can read everything and add notes.
-- Only a signed-in user (Ace) can add/edit/delete items or change the schedule.
alter table items enable row level security;
alter table notes enable row level security;
alter table schedule_days enable row level security;
alter table schedule_config enable row level security;

drop policy if exists "read items" on items;
drop policy if exists "ace writes items" on items;
create policy "read items" on items for select using (true);
create policy "ace writes items" on items for all to authenticated using (true) with check (true);

drop policy if exists "read notes" on notes;
drop policy if exists "add notes" on notes;
drop policy if exists "delete notes" on notes;
create policy "read notes" on notes for select using (true);
create policy "add notes" on notes for insert with check (true);
create policy "delete notes" on notes for delete using (true);

drop policy if exists "read days" on schedule_days;
drop policy if exists "ace writes days" on schedule_days;
create policy "read days" on schedule_days for select using (true);
create policy "ace writes days" on schedule_days for all to authenticated using (true) with check (true);

drop policy if exists "read config" on schedule_config;
drop policy if exists "ace writes config" on schedule_config;
create policy "read config" on schedule_config for select using (true);
create policy "ace writes config" on schedule_config for all to authenticated using (true) with check (true);

-- Live updates across devices
do $$
declare t text;
begin
  foreach t in array array['items','notes','schedule_days','schedule_config'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Seed: schedule config
insert into schedule_config (key, value) values
  ('subjects', '{"A":{"name":"Science","room":"Lab I"},"B":{"name":"Studio Arts","room":"218"},"C":{"name":"History","room":"207"},"D":{"name":"Algebra","room":"219"},"E":{"name":"English","room":"220"},"F":{"name":"Spanish II","room":"150"},"G":{"name":"Shark Tank","room":"211"}}'::jsonb),
  ('day_letters', '{"1":["A","B","C","D"],"2":["E","F","G","A"],"3":["B","C","D","E"],"4":["F","G","A","B"],"5":["C","D","E","F"],"6":["G","A","B","C"],"7":["D","E","F","G"]}'::jsonb),
  ('blocks', '[{"n":1,"start":"08:50","range":"8:50 – 10:00"},{"n":2,"start":"10:35","range":"10:35 – 11:55"},{"n":3,"start":"12:40","range":"12:40 – 1:50"},{"n":4,"start":"13:55","range":"1:55 – 3:00"}]'::jsonb),
  ('fixed', '[{"label":"Advisory / SH / Assembly","start":"08:20","range":"8:20 – 8:45","room":"210"},{"label":"Open","start":"10:00","range":"10:00 – 10:30"},{"label":"MS Lunch","start":"12:00","range":"12:00 – 12:35"},{"label":"Athletics / Extracurriculars","start":"15:05","range":"3:05 – 4:00"}]'::jsonb),
  ('terms', '[{"date":"2026-10-16","label":"Term 1 Ends","type":"end"},{"date":"2026-10-19","label":"Term 2 Begins","type":"begin"},{"date":"2026-12-18","label":"Term 2 Ends","type":"end"},{"date":"2027-01-05","label":"Term 3 Begins","type":"begin"},{"date":"2027-03-12","label":"Term 3 Ends","type":"end"},{"date":"2027-03-22","label":"Term 4 Begins","type":"begin"},{"date":"2027-05-28","label":"Term 4 Ends","type":"end"}]'::jsonb)
on conflict (key) do nothing;

-- Seed: rotation days (8/31/2026 – 12/15/2026, plus 1/5/2027)
insert into schedule_days (day_date, rotation) values
  ('2026-08-31', 3),
  ('2026-09-01', 4),
  ('2026-09-02', 5),
  ('2026-09-03', 6),
  ('2026-09-04', 7),
  ('2026-09-08', 1),
  ('2026-09-09', 2),
  ('2026-09-10', 3),
  ('2026-09-11', 4),
  ('2026-09-14', 5),
  ('2026-09-15', 6),
  ('2026-09-16', 7),
  ('2026-09-18', 2),
  ('2026-09-22', 3),
  ('2026-09-23', 4),
  ('2026-09-24', 5),
  ('2026-09-25', 6),
  ('2026-09-29', 1),
  ('2026-09-30', 2),
  ('2026-10-01', 3),
  ('2026-10-02', 4),
  ('2026-10-05', 5),
  ('2026-10-06', 6),
  ('2026-10-07', 7),
  ('2026-10-08', 1),
  ('2026-10-13', 2),
  ('2026-10-14', 3),
  ('2026-10-15', 4),
  ('2026-10-16', 5),
  ('2026-10-19', 6),
  ('2026-10-20', 7),
  ('2026-10-21', 1),
  ('2026-10-22', 2),
  ('2026-10-23', 3),
  ('2026-10-26', 4),
  ('2026-10-27', 5),
  ('2026-10-28', 6),
  ('2026-10-29', 7),
  ('2026-11-03', 1),
  ('2026-11-04', 2),
  ('2026-11-05', 3),
  ('2026-11-06', 4),
  ('2026-11-09', 5),
  ('2026-11-10', 6),
  ('2026-11-11', 7),
  ('2026-11-12', 1),
  ('2026-11-13', 2),
  ('2026-11-16', 3),
  ('2026-11-17', 4),
  ('2026-11-18', 5),
  ('2026-11-19', 6),
  ('2026-11-30', 7),
  ('2026-12-01', 1),
  ('2026-12-02', 2),
  ('2026-12-03', 3),
  ('2026-12-04', 4),
  ('2026-12-07', 5),
  ('2026-12-08', 6),
  ('2026-12-09', 7),
  ('2026-12-10', 1),
  ('2026-12-11', 2),
  ('2026-12-14', 3),
  ('2026-12-15', 4),
  ('2027-01-05', 1)
on conflict (day_date) do nothing;
