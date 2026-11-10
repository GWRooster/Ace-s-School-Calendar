-- Ace's Calendar: AM / PM placement for notes.
-- Run once in the Household Planner project: SQL Editor -> New query -> paste -> Run.
-- Existing notes become AM (top of the day).
alter table notes add column if not exists slot text not null default 'am';
alter table notes drop constraint if exists notes_slot_check;
alter table notes add constraint notes_slot_check check (slot in ('am','pm'));
