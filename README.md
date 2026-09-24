<p align="center">
  <img src="Logo.png" alt="Golf Club Tracker Logo" height="200">
</p>

<h1 align="center">Golf Club Tracker</h1>
<p align="center"><i>A mobile web app companion for keeping your card during a round of golf:<br>
Log the club behind every shot or just keep track of your score. One phone keeps the card for the whole group, with Stableford making the scores comparable across HCP and tees.</i></p>

<p align="center">
  <a href="https://robert-rjm.github.io/Golf-Club-Tracker/">
    <img src="https://img.shields.io/badge/▶%20TRY%20IT%20LIVE-2ea44f?style=for-the-badge&labelColor=1a1a1a" alt="Try It Live" height="30">
  </a>
</p>

---

## Features

**Two ways to keep your card.**

- Either tracking the club behind every shot, providing the most insights, with **Clubs & Shots**.
- Or alternatively, to only track the totals per hole, with the **Score Only** option.

**Follow a round from anywhere.** In the round summary, tap **Get a live code** to share the
round. Anyone can enter the code (e.g. `GX7-42K`) on the [live view page](https://robert-rjm.github.io/Golf-Club-Tracker/view.html)
to see the scorecard, Stableford points and clubs per hole, updating as the round is played.
Codes stop working 30 days after the last update, or straight away with **Stop sharing**.

## Usage

For the best experience, add it to your home screen. Works also in any mobile browser.

1. Open the [live app](https://robert-rjm.github.io/Golf-Club-Tracker/) in your browser
2. Tap **Share → Add to Home Screen**
3. Opens as a standalone app with no browser chrome

## Live sharing setup

Live codes need a free [Supabase](https://supabase.com) project. Without one the app works as
before and the Live Share section stays hidden.

1. Create a Supabase project
2. In **SQL Editor**, run [`supabase.sql`](supabase.sql)
3. From **Project Settings → API**, copy the project URL and the publishable (anon) key into
   `SUPABASE_URL` and `SUPABASE_KEY` at the top of [`share.js`](share.js)

The key is safe to publish: the rounds table can only be reached through the functions in
`supabase.sql`, and only the phone that created a code can update or delete it.

## Supported Courses

Course data (par, stroke index, and SSS/slope per tee) is stored in `courses.js`. Currently includes:

| Course | Holes | Par | Stableford |
|--------|-------|-----|------------|
| Golfclub St Genis | 9 · 18 | 37 (9 holes) | ✅ |
| Golfclub St Genis — 5 Hole | 5 | 16 | ✅ |
| Ugolf Aravella Andorra | 9 · 18 | 71 | ✅ |
| Grandvalira Golf Soldeu | 9 · 18 | 33 (9 holes) | ✅ |
| Others (custom) | 5 · 9 · 18 | you set each hole | only if you enter SSS & slope |

> The 5-hole course is reached by selecting **Golfclub St Genis**, then **5 holes**. Picking
> 18 on a 9-hole course plays that nine twice.

> Stableford needs SSS and Slope to work out your playing handicap. Every built-in course
> has them for each tee; a custom course can still track shots and scores without them,
> just without points.

### Want your course added?

Directly from the app, select **Others**: enter your course name, set the hole count, and tap **Suggest this course for the app** button. This will open a pre-filled GitHub issue, alternatively open an issue directly on GitHub.

**Open an Issue:**

1. Go to [Issues](../../issues) → **New Issue**
2. Title it `Course Request: [Course Name]`
3. Include: course name, number of holes, total par, par/SI for each hole, and the SSS
   and slope **along with which tee they were measured from** — ratings differ per tee,
   and for men and ladies

## License
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

This project is licensed under CC BY-NC-SA 4.0. See [LICENSE](LICENSE) for details.
