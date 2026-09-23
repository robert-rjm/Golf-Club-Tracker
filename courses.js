// Golf course data. Each entry needs par, sss, slope and holes [{ par, si }].
// sss/slope are 18-hole ratings, even on a 9-hole course. Add ratingPar when par isn't the 18-hole par.
// A `tees` list [{ colour, players, sss, slope }] with a `defaultTee` can replace the top-level sss/slope.

const COURSES = {
  'Golfclub St Genis': {
    // https://pages.ffgolf.org/tools/calculette?glfcod=0614&tercod=01&k=9d9be33fd9ad795bf40f665d8fd813e2
    par: 37, ratingPar: 74,
    defaultTee: 'Yellow',
    tees: [
      { colour: 'Black',  players: 'men',    sss: 70.2, slope: 132 },
      { colour: 'Black',  players: 'ladies', sss: 75.8, slope: 140 },
      { colour: 'White',  players: 'men',    sss: 70.2, slope: 132 },
      { colour: 'White',  players: 'ladies', sss: 75.8, slope: 140 },
      { colour: 'Yellow', players: 'men',    sss: 68.4, slope: 114 },
      { colour: 'Yellow', players: 'ladies', sss: 73.4, slope: 134 },
      { colour: 'Blue',   players: 'men',    sss: 66.4, slope: 106 },
      { colour: 'Blue',   players: 'ladies', sss: 70.8, slope: 130 },
      { colour: 'Red',    players: 'men',    sss: 64.8, slope: 106 },
      { colour: 'Red',    players: 'ladies', sss: 69.0, slope: 120 },
      { colour: 'Purple', players: 'men',    sss: 59.8, slope: 102 },
      { colour: 'Purple', players: 'ladies', sss: 63.4, slope: 116 },
      { colour: 'Orange', players: 'men',    sss: 54.0, slope: 114 },
      { colour: 'Orange', players: 'ladies', sss: 54.0, slope: 114 },
    ],
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
    par: 16, ratingPar: 58,
    defaultTee: 'Compact',
    tees: [
      { colour: 'Compact', players: 'men',    sss: 52.4, slope: 90 },
      { colour: 'Compact', players: 'ladies', sss: 54.6, slope: 90 },
    ],
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
    par: 71, ratingPar: 71,
    defaultTee: 'Yellow',
    tees: [
      { colour: 'Black',  sss: 72.7, slope: 140 },
      { colour: 'White',  sss: 71.1, slope: 139 },
      { colour: 'Yellow', sss: 68.7, slope: 129 },
      { colour: 'Blue',   sss: 72.1, slope: 129 },
      { colour: 'Red',    sss: 70.1, slope: 124 },
      ],

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
    par: 33, ratingPar: 66,
    defaultTee: 'Yellow',
    tees: [
      { colour: 'Yellow', players: 'men',    sss: 64.4, slope: 110 },
      { colour: 'Yellow', players: 'ladies', sss: 66.4, slope: 115 },
      { colour: 'Red',    players: 'men',    sss: 61.2, slope: 98 },
      { colour: 'Red',    players: 'ladies', sss: 63.4, slope: 113 },
    ],
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
