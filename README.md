# School Calendar

A small calendar site showing the school's day-rotation schedule (Day 1–7,
which class is in which block, term start/end dates) with the ability for
you and two other people to add notes to any day (e.g. "Alg Quiz" on
9/2). Notes are stored in Supabase and shared live between everyone who
has the link — it works on iPhone Safari and any desktop browser.

## 1. Set up Supabase (the notes database)

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Create a new project. Pick any name/region; the free tier is enough for this.
3. Once the project is ready, open **SQL Editor** in the left sidebar, click **New query**, paste in the entire contents of `supabase-setup.sql` from this folder, and click **Run**.
4. Go to **Project Settings** (gear icon) → **API**. Copy two values:
   - **Project URL**
   - **anon public** key (under "Project API keys")
5. Open `config.js` in this folder and paste those two values in, replacing the placeholder text. Save the file.

## 2. Put it on GitHub Pages

1. On [github.com](https://github.com), create a new repository (e.g. `school-calendar`). Public is fine, or private — GitHub Pages works with either on a paid plan; on a free personal account it needs to be **public**.
2. Upload all the files from this folder to that repository: `index.html`, `style.css`, `schedule-data.js`, `config.js` (with your real values now), `app.js`. (`README.md` and `supabase-setup.sql` can go up too, they're just reference and won't affect the site.)
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to "Deploy from a branch", branch **main**, folder **/ (root)**. Save.
5. Wait a minute, then refresh that page — GitHub will show your live URL, something like `https://yourusername.github.io/school-calendar/`.

That URL is what you open on your phone and share with the other two
people. Anyone with the link can view the schedule and add/delete notes —
there's no login — so just don't post the link somewhere public.

## Updating the schedule later

The rotation for Term 3 (after 1/5/27) and Term 4 isn't filled in yet
because it wasn't visible in the spreadsheet screenshot. To add it later,
open `schedule-data.js` and add more lines to the `DAY_ROTATION` object,
following the same pattern already there, e.g.:

```js
"2027-01-06": 2,
"2027-01-07": 3,
```

Commit/upload the updated file to GitHub and the site updates automatically
within a minute or two.

## Files in this folder

- `index.html` — the page itself
- `style.css` — styling
- `schedule-data.js` — the class schedule and day-rotation data (edit this to update the schedule)
- `config.js` — your Supabase project URL + anon key (fill this in, don't share it outside your repo's collaborators if the repo is private)
- `app.js` — the calendar rendering and notes logic
- `supabase-setup.sql` — one-time database setup script
