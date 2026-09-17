// Golf course data
// Add new courses here with each entry needing: par, sss, slope, and holes array (par + si per hole)
// For 9-hole courses, add ratingPar with the 18-hole par those ratings were measured against.
// sss and slope are always 18-hole-equivalent ratings, even for a 9-hole course.

const COURSES = {
  'Golfclub St Genis': {
    // https://pages.ffgolf.org/tools/calculette?glfcod=0614&tercod=01&k=9d9be33fd9ad795bf40f665d8fd813e2
    // Yellow tee
    par: 37, ratingPar: 74, sss: 68.4, slope: 114,
    holes: [
      { par: 4, si: 1 },
      { par: 5, si: 6 },
      { par: 4, si: 7 },
      { par: 3, si: 9 },
      { par: 4, si: 8 },
      { par: 4, si: 3 },
      { par: 5, si: 2 },
      { par: 3, si: 4 },
      { par: 5, si: 5 },
    ]
  },
  'Golfclub St Genis - 5 Hole': {
    // https://pages.ffgolf.org/tools/calculette?glfcod=0614&tercod=02&k=2462ec1091a0ecfd6403abd1e520cc34
    // Compact tee
    par: 16, ratingPar: 58, sss: 52.4, slope: 90,
    holes: [
      { par: 3, si: 1 },
      { par: 3, si: 2 },
      { par: 4, si: 3 },
      { par: 3, si: 4 },
      { par: 3, si: 5 },
    ]
  },
  'Ugolf Aravella Andorra': {
    // https://aravellgolfclub.com/el-camp
    // Yellow tee
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
    // Yellow tee
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
