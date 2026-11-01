// The 14 icons of PRD Section 8.3. Each is a set of 24x24 stroke paths. Labels live in the locale files as icon.<name>.
export const ICON_STATES = ['default', 'off', 'active', 'disabled'];

export const ICONS = {
  listen: ['M4 9v6h4l5 4V5L8 9H4z', 'M16 9a4 4 0 010 6', 'M18.5 6.5a8 8 0 010 11'],
  repeat: ['M4 12a8 8 0 0113.5-5.8L20 8', 'M20 4v4h-4', 'M20 12a8 8 0 01-13.5 5.8L4 16', 'M4 20v-4h4'],
  slower: ['M4 16c0-4 3-7 7-7s7 3 7 7z', 'M18 16h2.5a1.5 1.5 0 000-3H19', 'M7 16v3', 'M14 16v3'],
  speak: ['M9 3h6v10a3 3 0 01-6 0z', 'M5 11a7 7 0 0014 0', 'M12 18v3', 'M9 21h6'],
  tap: ['M9 11V5a1.5 1.5 0 013 0v6', 'M12 11V9.5a1.5 1.5 0 013 0V12', 'M15 12v-.5a1.5 1.5 0 013 0V16a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-4a1.5 1.5 0 012.5-1.5L9 15'],
  read: ['M3 5h7a2 2 0 012 2v13a2 2 0 00-2-2H3z', 'M21 5h-7a2 2 0 00-2 2v13a2 2 0 012-2h7z'],
  language: ['M3 12a9 9 0 1018 0 9 9 0 10-18 0', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  next: ['M5 12h14', 'M13 6l6 6-6 6'],
  skip: ['M5 5l9 7-9 7z', 'M18 5v14'],
  yesno: ['M3 14l4 4 6-8', 'M15 4l6 6', 'M21 4l-6 6'],
  help: ['M3 12a9 9 0 1018 0 9 9 0 10-18 0', 'M8.5 12a3.5 3.5 0 107 0 3.5 3.5 0 10-7 0', 'M5.6 5.6l3.9 3.9', 'M14.5 14.5l3.9 3.9', 'M18.4 5.6l-3.9 3.9', 'M9.5 14.5l-3.9 3.9'],
  followup: ['M3 12a9 9 0 1018 0 9 9 0 10-18 0', 'M12 7v10', 'M7 12h10'],
  addfile: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M8.5 13.5a3.5 3.5 0 107 0 3.5 3.5 0 10-7 0'],
};

export const ICON_NAMES = Object.keys(ICONS);
