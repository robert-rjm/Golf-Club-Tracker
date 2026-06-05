// Golf course data
// Add new courses here — each entry needs: par, sss, slope, and holes array (par + si per hole)

const COURSES = {
  'Golfclub St Genis': {
    par: 74, sss: 70.2, slope: 131,
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
  }
};

// Names shown as buttons in the lobby (last entry should always be 'Others')
const PRESET_COURSES = ['Golfclub St Genis', 'Others'];
