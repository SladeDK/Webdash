// =====================================================
// Active Helpers
// =====================================================

function getCurrentTheme() {
  return userPreferences?.appearance?.theme;
}

function getCurrentBackground() {
  return userPreferences?.appearance?.background;
}


// =====================================================
// Theme definitions (global)
// =====================================================

window.THEMES = [
  {
    id: 'system',
    label: 'System',
    description: 'Follows the theme of your operating system'
  },
  {
    id: 'theme-dark',
    label: 'Dark',
    description: 'Standard dark dashboard theme'
  },
  {
    id: 'theme-light',
    label: 'Light',
    description: 'Clean, bright layout for daytime use'
  },
  {
    id: 'theme-midnight',
    label: 'Midnight',
    description: 'Deep blue tones for low-light environments'
  },
  {
    id: 'theme-slate',
    label: 'Slate',
    description: 'Neutral, professional gray-blue palette'
  },
  {
    id: 'theme-nord',
    label: 'Nord',
    description: 'Soft, cool contrast inspired by Nord colors'
  },
  {
    id: 'theme-carbon',
    label: 'Carbon',
    description: 'Ultra-dark theme with high contrast'
  },
  {
    id: 'theme-glass',
    label: 'Glass',
    description: 'Frosted glass effect with depth'
  }
];


// =====================================================
// Background definitions (global)
// =====================================================

window.BACKGROUNDS = [
  { id: 'bg-plain', label: 'Plain', previewClass: 'bg-preview-plain' },
  { id: 'bg-gradient', label: 'Soft Gradient', previewClass: 'bg-preview-gradient' },
  { id: 'bg-focus', label: 'Focus Glow', previewClass: 'bg-preview-focus' },
  { id: 'bg-glass', label: 'Glass Atmosphere', previewClass: 'bg-preview-glass' },
  { id: 'bg-dotted', label: 'Dotted Pattern', previewClass: 'bg-preview-dotted' },
  { id: 'bg-webbed', label: 'Webbed Pattern', previewClass: 'bg-preview-webbed' },
  { id: 'bg-triangle-gradient', label: 'Triangle Gradient', previewClass: 'bg-preview-triangle-gradient' },
  { id: 'bg-triangle-subtle', label: 'Triangle Subtle', previewClass: 'bg-preview-triangle-subtle' },
  { id: 'bg-hex', label: 'Hex Pattern', previewClass: 'bg-preview-hex' },
  { id: 'bg-topo', label: 'Topographical', previewClass: 'bg-preview-topo' },
  { id: 'bg-circuit', label: 'Circuit Board', previewClass: 'bg-preview-circuit' }
];