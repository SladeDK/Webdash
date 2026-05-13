// core/appearance.constants.js 

export const VALID_BACKGROUNDS = [
  'bg-plain',
  'bg-gradient',
  'bg-focus',
  'bg-glass',
  'bg-dotted',
  'bg-webbed',
  'bg-triangle-gradient',
  'bg-triangle-subtle',
  'bg-hex',
  'bg-topo',
  'bg-circuit'
];

export function isValidTheme(theme) {
  return typeof theme === 'string' && VALID_THEMES.includes(theme);
}

export function isValidBackground(bg) {
  return typeof bg === 'string' && VALID_BACKGROUNDS.includes(bg);
}


export const VALID_THEMES = [
  'system',
  'theme-dark',
  'theme-light',
  'theme-midnight',
	'theme-slate',
  'theme-nord',
  'theme-carbon',
  'theme-glass'
];
