const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const srcDir = path.join(__dirname, 'src');

// Files in dependency order
const files = [
  'config.js',
  'theme.js',
  'utils/formatting.js',
  'utils/svg.js',
  'utils/api.js',
  'components/Num.jsx',
  'components/StatusDot.jsx',
  'components/Kicker.jsx',
  'components/Rule.jsx',
  'components/ItalicDeck.jsx',
  'components/LineChart.jsx',
  'components/OnThisDay.jsx',
  'components/ProofOfRead.jsx',
  'components/WxGlyph.jsx',
  'hooks/useResettableInterval.js',
  'hooks/useClock.js',
  'hooks/useBTC.js',
  'hooks/useChain.js',
  'hooks/useBitaxe.js',
  'hooks/useWeather.js',
  'hooks/useRSS.js',
  'hooks/useFeedHealth.js',
  'hooks/usePageRefresh.js',
  'components/Masthead.jsx',
  'components/Price.jsx',
  'components/Ticker.jsx',
  'components/Chain.jsx',
  'components/Weather.jsx',
  'components/Miners.jsx',
  'components/MastheadPanel.jsx',
  'components/CommandCenter.jsx',
  'App.jsx',
];

// Read and concatenate
let concatenated = '';
files.forEach(file => {
  const fullPath = path.join(srcDir, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf-8');

    // Remove CommonJS wrapper (only for Node testing)
    content = content.replace(
      /if \(typeof module !== 'undefined' && module\.exports\)[\s\S]*?\}\s*$/m,
      ''
    );

    // Remove import/export statements since all code is concatenated
    // Remove named imports: import { X, Y } from 'module'
    content = content.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"]\s*;?\n?/g, '');
    // Remove default imports: import X from 'module'
    content = content.replace(/import\s+\w+\s+from\s+['"][^'"]*['"]\s*;?\n?/g, '');
    // Remove standalone imports: import 'module'
    content = content.replace(/import\s+['"][^'"]*['"]\s*;?\n?/g, '');
    // Remove export default: export default X;
    content = content.replace(/export\s+default\s+\w+\s*;?\n?/g, '');
    // Remove export async function: export async function X(...) { ... }
    content = content.replace(/export\s+async\s+/g, 'async ');
    // Remove export function: export function X(...) { ... }
    content = content.replace(/export\s+(function|const|let|var|class)\s+/g, '$1 ');
    // Remove export { ... }
    content = content.replace(/export\s+\{[^}]*\}\s*;?\n?/g, '');

    concatenated += '\n' + content;
  } else {
    console.warn(`Warning: File not found: ${file}`);
  }
});

// Read base template
const baseTemplate = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf-8');

// Replace placeholder
const htmlWithCode = baseTemplate.replace(
  '/* MODULES CONCATENATED BY build.js */',
  () => concatenated
);

// Write HTML directly (no esbuild wrapping)
fs.writeFileSync('Command Center.html', htmlWithCode);
console.log('✓ Built Command Center.html');
