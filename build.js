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
  'utils/v2prefs.js',
  'utils/alertThresholds.js',
  'utils/scale.js',
  'utils/ipValidation.js',
  'components/ErrorBoundary.jsx',
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
  'hooks/useAlerts.js',
  'hooks/useHistory.js',
  'hooks/usePageRefresh.js',
  'hooks/useViewportMode.js',
  'components/Masthead.jsx',
  'components/Price.jsx',
  'components/Ticker.jsx',
  'components/Chain.jsx',
  'components/Weather.jsx',
  'components/Miners.jsx',
  'components/SettingsPanel.jsx',
  'components/NetworkStatusWidget.jsx',
  'components/mobile/MobileTabBar.jsx',
  'components/mobile/StatusTile.jsx',
  'components/mobile/MobileHeader.jsx',
  'components/mobile/HomePanel.jsx',
  'components/mobile/BitcoinPanel.jsx',
  'components/mobile/NewsPanel.jsx',
  'components/mobile/MobileApp.jsx',
  'components/CommandCenter.jsx',
  'App.jsx',
];

// Read and concatenate
let concatenated = '';
for (const file of files) {
  const fullPath = path.join(srcDir, file);
  if (!fs.existsSync(fullPath)) {
    console.warn(`Warning: File not found: ${file}`);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf-8');

  // Remove CommonJS wrapper (only for Node testing)
  content = content.replace(
    /if \(typeof module !== 'undefined' && module\.exports\)[\s\S]*?\}\s*$/m,
    ''
  );

  // Strip ESM imports/exports (keep concatenation model)
  content = content.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"]\s*;?\n?/g, '');
  content = content.replace(/import\s+\w+\s+from\s+['"][^'"]*['"]\s*;?\n?/g, '');
  content = content.replace(/import\s+['"][^'"]*['"]\s*;?\n?/g, '');
  content = content.replace(/export\s+default\s+\w+\s*;?\n?/g, '');
  content = content.replace(/export\s+async\s+/g, 'async ');
  content = content.replace(/export\s+(function|const|let|var|class)\s+/g, '$1 ');
  content = content.replace(/export\s+\{[^}]*\}\s*;?\n?/g, '');

  // Build-time JSX transform for .jsx files
  if (file.endsWith('.jsx')) {
    try {
      const result = esbuild.transformSync(content, {
        loader: 'jsx',
        jsx: 'transform',
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
        target: 'es2018',
      });
      content = result.code;
    } catch (err) {
      console.error(`Error transforming ${file}:`, err.message);
      process.exit(1);
    }
  }

  concatenated += '\n' + content;
}

// Inline vendored React + ReactDOM
const reactSrc    = fs.readFileSync(path.join(srcDir, 'vendor', 'react.production.min.js'), 'utf8');
const reactDomSrc = fs.readFileSync(path.join(srcDir, 'vendor', 'react-dom.production.min.js'), 'utf8');
const vendorBlock = `<script>${reactSrc}</script>\n<script>${reactDomSrc}</script>`;

// Read base template
const baseTemplate = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf-8');

// Guard: placeholders must be present in the template or the build is silently broken
if (!baseTemplate.includes('<!-- VENDOR -->')) {
  console.error('Error: src/index.html is missing <!-- VENDOR --> placeholder');
  process.exit(1);
}
if (!baseTemplate.includes('/* MODULES CONCATENATED BY build.js */')) {
  console.error('Error: src/index.html is missing /* MODULES CONCATENATED BY build.js */ placeholder');
  process.exit(1);
}

// Replace placeholders
const htmlWithCode = baseTemplate
  .replace('<!-- VENDOR -->', () => vendorBlock)
  .replace('/* MODULES CONCATENATED BY build.js */', () => concatenated);

// Write HTML directly (no esbuild wrapping)
fs.writeFileSync('index.html', htmlWithCode);
console.log('✓ Built index.html');
