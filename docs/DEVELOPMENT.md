# Development

How the app is put together, how to run your own copy, and the rules the scoring code must keep.
For what the app does, see the [README](../README.md).

## Licence

The app is licensed under [CC BY-NC-SA 4.0](../LICENSE). You can run and change your own copy
as long as it is **non-commercial**, **credits Robert Michels** with a link back to this
repository, and is shared under the **same licence**.

## Running it

There's no build step, no package manager and no test runner. Open `index.html` in a browser,
or serve the folder from any static host (the live app is on GitHub Pages).

### Your own copy

Two settings point at this project's services. Change them before you publish a copy, or
your copy's data ends up with this project:

- `SUPABASE_URL` and `SUPABASE_KEY` at the top of `share.js`: set them to your own Supabase
  project (see below), or empty them (`''`) to turn off live sharing and course submissions
- `GITHUB_REPO` in `js/lobby.js`: the repository that **⬆ Suggest this course for the app**
  opens an issue on

Everything a player does is saved in the browser's `localStorage` under `gct_*` keys. There
is no account or server copy. The only network calls are the optional Supabase ones below.

## Files

| File | What it's for |
|------|---------------|
| `index.html` | The app: hole screen, lobby, and the summary, settings and course-editor overlays |
| `styles.css` | Styles for `index.html` and `view.html` |
| `courses.js` | Built-in course data (`COURSES`), and the lobby's course list built from it (`PRESET_COURSES`) |
| `share.js` | Supabase connection details and helpers, shared by the app and the live view |
| `supabase.sql` | Tables and functions for the Supabase project |
| `view.html` · `view.js` | Read-only live view of a shared round, opened with a code |
| `Logo.png` | Solid-background logo: browser-tab and home-screen icon, README header. iOS fills a transparent home-screen icon with black, and GitHub's light theme would hide the white ball |
| `Logo-transparent.png` | Transparent logo used inside the app (lobby, header, labels) and the live view |
| `js/` | The app's code, split by screen (below) |

### `js/`

The files share one global scope: no modules, no imports. `index.html` loads them in this
order, and each file may only *run* code that uses the files above it. Functions can still
call ones defined further down, as long as they aren't called before that file has loaded.

| File | What it's for |
|------|---------------|
| `state.js` | Shared state (bag, round, lobby choices, players) and loading/saving it. Loaded first |
| `scoring.js` | The course as played this round, playing handicap, strokes received, Stableford |
| `round.js` | The hole screen: hole strip, club buttons, score-only pad, partner scores, undo |
| `summary.js` | Round summary, detail sheets, copy to clipboard, New Round |
| `live-share.js` | Getting a live code and pushing the round to Supabase while it's active |
| `players.js` | Playing partners and saved friends |
| `lobby.js` | The lobby: restoring the last round, course search, holes, tees, starting a round |
| `course-editor.js` | Saved courses and the course editor |
| `settings.js` | The ⚙ settings overlay |
| `main.js` | Start-up. Loaded last |

`view.html` loads only `share.js` and `view.js`.

### Saved data

| Keys | Holds |
|------|-------|
| `gct_round`, `gct_hole`, `gct_holes`, `gct_players`, `gct_course`, `gct_hcp`, `gct_selected*`, `gct_second*`, `gct_custom*`, `gct_trackclubs` | The current round and the lobby choices behind it |
| `gct_lastround` | The previous round, kept so the lobby can restore it |
| `gct_bag` | The player's clubs |
| `gct_friends` | Saved playing partners |
| `gct_usercourses` | Courses saved in the course editor |
| `gct_coursestats` | Rounds played per course, used to order the lobby's course buttons |
| `gct_sharecode`, `gct_sharesecret` | The active live code and the secret that owns it |

`ROUND_KEYS` in `js/lobby.js` lists exactly which keys make up a round. Add a new round
setting there too, or restoring the last round will lose it.

## Live sharing and course submissions

Both need a free [Supabase](https://supabase.com) project. `share.js` ships with this
project's own URL and key filled in, so a copy has to replace them or empty them. With either
one empty, the app works as normal and hides the Live Share section, the
**📡 Follow a live round** button and course submissions.

### Setting up a project

1. Create a Supabase project
2. In **SQL Editor**, run [`supabase.sql`](../supabase.sql). It's safe to run again, which adds
   anything missing from an older setup
3. From **Project Settings → API**, copy the project URL and the publishable (anon) key into
   `SUPABASE_URL` and `SUPABASE_KEY` at the top of [`share.js`](../share.js)

### How it works

The app calls Postgres functions through the Supabase REST endpoint (`supabaseRpc` in
`share.js`). Both tables have row-level security on and no policies, so the public key
can't touch them directly. It can only call these functions:

| Function | Used by | Does |
|----------|---------|------|
| `share_round(code, secret, data)` | `live-share.js` | Creates a code, or updates it if the secret matches. Clears out codes idle for 30 days |
| `get_round(code)` | `view.js` | Returns the round for a code, if updated in the last 30 days |
| `unshare_round(code, secret)` | `live-share.js` | Deletes a code, if the secret matches (**Stop sharing**) |
| `submit_course(name, snippet, data)` | `course-editor.js` | Adds a course submission. Insert only, 50 an hour across everyone |

A live code is 6 characters, shown as `ABC-123`. The phone that creates it also makes a random
secret and keeps it in `gct_sharesecret`. Only its hash is stored, so only that phone can
update or delete the code. While a code is active, every save pushes the whole round, waiting
2 seconds so a burst of taps goes as one update. `view.js` fetches it again every 30 seconds.

### Adding a submitted course

Every save in the course editor sends a submission, edits included.

1. In **Table Editor → course_submissions**, take the newest row for the course
2. Check the ratings against the source in the note, if there is one
3. Paste its `snippet` into `COURSES` in `courses.js` (see below)

## Course data

Each entry in `COURSES` (in `courses.js`) looks like this:

```js
'Grandvalira Golf Soldeu': {
  // https://www.grandvalira.com/en/golf-soldeu   ← where the ratings came from
  par: 33, ratingPar: 66,
  defaultTee: 'Yellow',
  tees: [
    { colour: 'Yellow', players: 'men',    sss: 64.4, slope: 110 },
    { colour: 'Yellow', players: 'ladies', sss: 66.4, slope: 115 },
  ],
  holes: [
    { par: 4, si: 4 },
    // one { par, si } per hole
  ]
},
```

- `par` is the sum of the hole pars.
- `sss` and `slope` are always **18-hole** ratings, even on a 9-hole course. `calcPlayingHCP`
  scales the course handicap by `holesPlayed / 18`, so nothing else should scale them first.
- `ratingPar` is the par those ratings were measured against. Add it when it isn't `par`, as
  on a 9-hole course: 9-hole `par`, 18-hole `ratingPar`. The course handicap formula uses
  `ratingPar`; everything else uses `par`.
- `si` is the stroke index, ranked 1..18 across the whole entry.
- A course with a single rating can use top-level `sss` and `slope` instead of `tees`.
  `players` (`'men'` or `'ladies'`) is only needed when a colour has different ratings for each.
- A comment at the top says where the ratings came from, and which tee if it isn't obvious.

The lobby's course list (`PRESET_COURSES`) is built from `COURSES`, so a new entry appears on its
own. The order of the entries matters: the first few are the lobby's buttons until there's play
history, and the rest are found by search.

**Hole counts.** A course with an 18-hole entry offers 9 holes (front or back) as well. A course
with only a 9-hole entry offers 18 by playing it twice. A different layout at the same club is
a second entry named `'<Course> - <N> Hole'`, like `'Golfclub St Genis - 5 Hole'`. The lobby
shows it as a hole count under the main course, not as a course of its own.

Courses saved in the editor are stored in `gct_usercourses` in the same shape, and merged into
`COURSES` at start-up. A built-in entry with the same name wins.

## Scoring

`js/scoring.js` holds the handicap and Stableford maths, and it's the easiest part to get
subtly wrong. A round can play one nine, repeat holes (a second round), or use holes with no
stroke index (custom courses). So `strokesOnHole` first ranks the holes actually in play into a
dense 1..n and only then hands out strokes. Don't compare a raw `si` against a remainder.

Whenever the round doubles or slices the hole list (`withSecondRound`, `nineSlice`,
`withStartNine`), `par`, `ratingPar`, `sss` and `slope` must keep the course's rating values.

Two checks that must hold for every combination of course, hole count, nine and second round:

1. **The strokes add up.** The strokes `strokesOnHole` gives across all holes played add up to
   exactly the playing handicap. This is the best single test of a change.
2. **Par scores as expected.** A round with every hole parred scores exactly
   `2 × holes + playing handicap` Stableford points.

There's no test runner, so check them from the browser console on a started round. For the
main player, whose handicap is the global `hcp` (partners carry their own `hcp`):

```js
const course = getCourseData(players[0]);
const phcp = calcPlayingHCP(hcp, course, totalHolesPlayed());
course.holes.reduce((s, _, i) => s + strokesOnHole(i, phcp, course), 0) === phcp;
```
