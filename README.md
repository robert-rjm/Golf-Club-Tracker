# Golf Club Tracker ⛳

A mobile web app companion for tracking which clubs you hit on every shot during a round of golf. Easy tap and track to review your round later.

**[Try it live →](https://robert-rjm.github.io/Golf-Club-Tracker/)**

---

## Features

- Track every shot hit per shot, per hole
- Select your bag setup before the round, only see clubs you are carrying
- View and edit shot sequences per hole
- Automatic Stableford points calculation when course data (SSS, slope) is available
- Get a round summary with total shots and most used clubs
- Copy your full round to clipboard for sharing or notes

## Usage

For the best experience, add it to your home screen. Works also in any mobile browser.

1. Open the [live app](https://robert-rjm.github.io/Golf-Club-Tracker/) in Safari
2. Tap **Share → Add to Home Screen**
3. Opens as a standalone app with no browser chrome

## ⛳ Supported Courses

Course data (par, stroke index, SSS, slope) is stored in `courses.js`. Currently includes:

| Course | Holes | Par | Slope | Stableford |
|--------|-------|-----|-------|------------|
| St Genis - 18 Hole | 9 - 18 | 74 | 131 | ✅ |
| St Genis - 5 Hole | 5 | 17 | N/A | ❌ |
| Other | 9 - 18 | selectable | N/A | ❌ |

> ℹ️ Stableford scoring requires SSS and slope to calculate your playing handicap. Courses without these values will still track clubs and shots — just without points.

### Want your course added?
**Open an Issue:**

1. Go to [Issues](../../issues) → **New Issue**
2. Title it `Course Request: [Course Name]`
3. Include: course name, number of holes, total par, SSS, slope, and par/SI for each hole

## License
This project is licensed under the MIT License, please see the [LICENSE](LICENSE) file for details.
