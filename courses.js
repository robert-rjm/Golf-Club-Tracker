// Golf course data
// Add new courses here — each entry needs: par, sss, slope, and holes array (par + si per hole)
//
// sss and slope are always 18-hole-equivalent ratings, even for a 9-hole course. For a
// 9-hole entry that means `par` (the sum of its nine holes) is NOT the par those ratings
// were measured against, so add `ratingPar` with the 18-hole figure — the course handicap
// formula uses ratingPar, everything else uses par.

const COURSES = {
  'Golfclub St Genis': {
    // Yellow starting tee
    par: 74, sss: 68.4, slope: 114,
    holes: [
      { par: 4, si: 1  },
      { par: 5, si: 11 },
      { par: 4, si: 13 },
      { par: 3, si: 17 },
      { par: 4, si: 15 },
      { par: 4, si: 5  },
      { par: 5, si: 3  },
      { par: 3, si: 7  },
      { par: 5, si: 9  },
      { par: 4, si: 2  },
      { par: 5, si: 12 },
      { par: 4, si: 14 },
      { par: 3, si: 18 },
      { par: 4, si: 16 },
      { par: 4, si: 6  },
      { par: 5, si: 4  },
      { par: 3, si: 8  },
      { par: 5, si: 10 },
    ]
  },
  'Golfclub St Genis - 5 Hole': {
    par: 16, sss: null, slope: null,
    holes: [
      { par: 3, si: null },
      { par: 3, si: null },
      { par: 4, si: null },
      { par: 3, si: null },
      { par: 3, si: null },
    ]
  },
  'Ugolf Aravella Andorra': {
    // https://aravellgolfclub.com/el-camp
    // Yellow starting tee
    par: 71, sss: 68.7, slope: 129,
    holes: [
      { par: 4, si: 2  },
      { par: 3, si: 10 },
      { par: 4, si: 18 },
      { par: 5, si: 16 },
      { par: 4, si: 12 },
      { par: 3, si: 6  },
      { par: 5, si: 8  },
      { par: 4, si: 4  },
      { par: 3, si: 14 },
      { par: 4, si: 3  },
      { par: 4, si: 7  },
      { par: 3, si: 13 },
      { par: 4, si: 15 },
      { par: 5, si: 9  },
      { par: 3, si: 5  },
      { par: 5, si: 1  },
      { par: 3, si: 17 },
      { par: 5, si: 11 },
    ]
  },
  'Grandvalira Golf Soldeu': {
    // https://www.grandvalira.com/en/golf-soldeu
    // Yellow starting tee. 9-hole course: par 33 over its nine holes, but sss 64.4 is an
    // 18-hole-equivalent rating, so it is rated against an 18-hole par of 66.
    par: 33, ratingPar: 66, sss: 64.4, slope: 110,
    holes: [
      { par: 4, si: 4  },
      { par: 3, si: 6  },
      { par: 4, si: 2  },
      { par: 4, si: 5  },
      { par: 3, si: 8  },
      { par: 4, si: 7  },
      { par: 3, si: 3  },
      { par: 5, si: 1  },
      { par: 3, si: 9 },
    ]
  }
};

// Names shown as buttons in the lobby (last entry should always be 'Others')
const PRESET_COURSES = ['Golfclub St Genis', 'Ugolf Aravella Andorra', 'Grandvalira Golf Soldeu', 'Others'];
