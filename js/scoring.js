// The course as played this round, and the handicap and Stableford maths.
// CLAUDE.md lists the invariants every change here must keep.

function withSecondRound(courseObj) {
  if (!secondRound) return courseObj;
  // Only the holes double. The ratings stay 18-hole values, calcPlayingHCP scales them.
  return { ...courseObj, holes: [...courseObj.holes, ...courseObj.holes] };
}

// Front or back nine of an 18-hole entry
function nineSlice(courseObj, side) {
  return side === 'back' ? courseObj.holes.slice(9, 18) : courseObj.holes.slice(0, 9);
}

// Rotate an 18-hole course to start on back 9 when selectedStart === 'back'
function withStartNine(courseObj) {
  if (selectedStart !== 'back' || courseObj.holes.length !== 18) return courseObj;
  const holes = [...courseObj.holes.slice(9), ...courseObj.holes.slice(0, 9)];
  return { ...courseObj, holes };
}

// Picks { sss, slope } for a tee and category, falling back to the default tee.
// A tee entry with no `players` is rated for every category.
function ratingFor(course, tee, players) {
  if (!course.tees || !course.tees.length) return { sss: course.sss, slope: course.slope };
  const pick = (colour, cat) => course.tees.find(x =>
    (!colour || x.colour === colour) && (!cat || !x.players || x.players === cat));
  const colour = tee || course.defaultTee;
  const t = pick(colour, players)
         || pick(colour, null)
         || pick(course.defaultTee, players)
         || pick(course.defaultTee, null)
         || course.tees[0];
  return { sss: t.sss, slope: t.slope };
}

// Course data for the round with the player's tee ratings applied
function getCourseData(player) {
  const course = buildCourseData();
  if (!course) return course;
  const tee = (player && player.tee) || selectedTee;
  return { ...course, ...ratingFor(course, tee, player && player.category) };
}

function buildCourseData() {
  const explicit = Object.values(COURSES).find(c =>
    courseBaseName(c) === selectedCourse && c.holes.length === selectedHoles
  );
  if (explicit) return withSecondRound(withStartNine(explicit));
  // 9 holes sliced from an 18-hole entry
  if (selectedHoles === 9 && selectedNine) {
    const full = Object.values(COURSES).find(c =>
      courseBaseName(c) === selectedCourse && c.holes.length === 18
    );
    if (full) {
      // A second round may be on the other nine
      const holes = secondRound
        ? [...nineSlice(full, selectedNine), ...nineSlice(full, secondNine || selectedNine)]
        : nineSlice(full, selectedNine);
      // Keep the 18-hole par/ratingPar/sss/slope, calcPlayingHCP scales for holes played
      return { ...full, holes };
    }
  }
  // Custom course, built from customHolePars
  if (selectedHoles > 0) {
    const baseHoles = Array.from({ length: selectedHoles }, (_, i) => ({
      par: customHolePars[i] || null, si: null
    }));
    const holes = secondRound ? [...baseHoles, ...baseHoles] : baseHoles;
    const knownPars = baseHoles.filter(h => h.par !== null);
    const basePar = knownPars.length ? knownPars.reduce((s, h) => s + h.par, 0) : null;
    // customSSS is an 18-hole rating, so ratingPar is scaled to 18 holes too
    const ratingPar = basePar !== null ? basePar * 18 / selectedHoles : null;
    return { par: basePar, ratingPar, sss: customSSS, slope: customSlope, holes };
  }
  return null;
}

function totalHolesPlayed() {
  return selectedHoles * (secondRound ? 2 : 1);
}

// Strips the ' - N Hole' suffix
function courseBaseName(courseData) {
  const key = Object.keys(COURSES).find(k => COURSES[k] === courseData);
  return key ? key.replace(/\s*-\s*\d+\s*Hole$/i, '') : '';
}

// WHS course handicap scaled to the holes played. Uses ratingPar, not the played par.
function calcPlayingHCP(playerHcp, course, totalHoles) {
  if (course.slope == null || course.sss == null) return Math.round(playerHcp * totalHoles / 18);
  const ratingPar = course.ratingPar ?? course.par;
  const ch = Math.round(playerHcp * (course.slope / 113) + (course.sss - ratingPar));
  return Math.round(ch * totalHoles / 18);
}

// Ranks the holes in play 1..n by SI, so the strokes handed out sum to the playing handicap
function strokeRanks(course) {
  const order = course.holes.map((h, i) => ({ i, si: h.si == null ? Infinity : h.si }));
  // Ties (repeated nine, no SI) go in playing order
  order.sort((a, b) => a.si - b.si || a.i - b.i);
  const ranks = new Array(course.holes.length);
  order.forEach((o, r) => { ranks[o.i] = r + 1; });
  return ranks;
}

// Extra strokes received on a hole (0-based index)
function strokesOnHole(holeIdx, playingHcp, course) {
  const numHoles = course.holes.length;
  if (!numHoles) return 0;
  const rank = strokeRanks(course)[holeIdx];
  if (playingHcp >= 0) {
    return Math.floor(playingHcp / numHoles) + (rank <= playingHcp % numHoles ? 1 : 0);
  }
  // Negative handicap gives strokes back, starting at the easiest hole
  const give = -playingHcp;
  return -(Math.floor(give / numHoles) + (numHoles - rank < give % numHoles ? 1 : 0));
}

// Stableford points for a hole, null if not played
function stablefordPoints(holeIdx, grossShots, playingHcp, course) {
  if (!grossShots) return null;
  const par     = course.holes[holeIdx].par;
  if (par === null) return null;
  const strokes = strokesOnHole(holeIdx, playingHcp, course);
  return Math.max(0, 2 + par + strokes - grossShots);
}

// Net double bogey cap
function adjustedGrossForHole(holeIdx, grossShots, playingHcp, course) {
  if (!grossShots) return null;
  const par = course.holes[holeIdx].par;
  if (par === null) return null;
  const strokes = strokesOnHole(holeIdx, playingHcp, course);
  return Math.min(grossShots, par + 2 + strokes);
}

// WHS score differential, PCC taken as 0. Partial rounds are scaled to 18 holes.
function scoreDifferential(course, holesCounted, adjustedGrossTotal) {
  if (!course || course.slope == null || course.sss == null || !holesCounted) return null;
  const sss  = course.sss * holesCounted / 18;
  const diff = (113 / course.slope) * (adjustedGrossTotal - sss);
  return diff * 18 / holesCounted;
}
