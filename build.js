const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const srcDir = path.join(__dirname, 'src');
const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

async function buildBundle() {
  const result = await esbuild.build({
    entryPoints: [path.join(srcDir, 'App.jsx')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2018',
    loader: { '.js': 'jsx', '.jsx': 'jsx' },
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    external: ['react', 'react-dom/client'],
    write: false,
    logLevel: 'warning',
    define: { __VERSION__: JSON.stringify(version) },
  });
  return result.outputFiles[0].text;
}

(async () => {
  const baseTemplate = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf-8');

  if (!baseTemplate.includes('<!-- VENDOR -->')) {
    console.error('Error: src/index.html is missing <!-- VENDOR --> placeholder');
    process.exit(1);
  }
  if (!baseTemplate.includes('/* MODULES CONCATENATED BY build.js */')) {
    console.error('Error: src/index.html is missing /* MODULES CONCATENATED BY build.js */ placeholder');
    process.exit(1);
  }

  const reactSrc    = fs.readFileSync(path.join(srcDir, 'vendor', 'react.production.min.js'), 'utf8');
  const reactDomSrc = fs.readFileSync(path.join(srcDir, 'vendor', 'react-dom.production.min.js'), 'utf8');

  // Bridge: esbuild emits require('react') / require('react-dom/client') because
  // we marked them external. Provide a require() that resolves to our globals.
  const requireShim = `
    var __dn_modules = {
      'react': React,
      'react-dom/client': ReactDOM
    };
    var require = function(id) {
      if (id in __dn_modules) return __dn_modules[id];
      throw new Error('unexpected require: ' + id);
    };
  `;

  const vendorBlock = `<script>${reactSrc}</script>\n<script>${reactDomSrc}</script>`;

  let bundleCode;
  try {
    bundleCode = await buildBundle();
  } catch (err) {
    console.error('esbuild bundle failed:', err.message);
    process.exit(1);
  }

  const finalCode = requireShim + '\n' + bundleCode;

  const htmlWithCode = baseTemplate
    .replace('<!-- VENDOR -->', () => vendorBlock)
    .replace('/* MODULES CONCATENATED BY build.js */', () => finalCode);

  fs.writeFileSync('index.html', htmlWithCode);
  console.log('✓ Built index.html');
})();
