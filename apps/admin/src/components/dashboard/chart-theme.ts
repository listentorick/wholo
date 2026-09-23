// Shared look for every ECharts chart on the dashboards. Design tokens
// (apps/admin/src/styles/theme.css) resolved to literal hex — canvas rendering
// can't resolve CSS custom properties.
export const MUTED_COLOR = '#5B6B7F';
export const TEXT_COLOR = '#0B1D3A';
export const BORDER_COLOR = '#E6ECF2';

export const chartTooltip = {
  backgroundColor: '#ffffff',
  borderColor: BORDER_COLOR,
  borderWidth: 1,
  textStyle: { color: TEXT_COLOR, fontSize: 12 },
  extraCssText: 'border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);',
};

export const axisLabelStyle = { fontSize: 10, color: MUTED_COLOR };
export const axisLineStyle = { lineStyle: { color: BORDER_COLOR } };
export const splitLineStyle = { lineStyle: { color: BORDER_COLOR } };
