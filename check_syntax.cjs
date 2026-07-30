// Quick JSX bracket checker for App.jsx
const fs = require('fs');
const code = fs.readFileSync('src/App.jsx', 'utf8');
const lines = code.split('\n');

// Count JSX angle brackets and curly braces
let depth = { '<': 0, '{': 0, '(': 0 };
let errors = [];

// Simple approach: just check if esbuild can parse it
try {
  const esbuild = require('esbuild');
  esbuild.transformSync(code, { loader: 'jsx', jsx: 'automatic' });
  console.log('✅ BUILD OK - No syntax errors');
} catch (e) {
  if (e.errors) {
    e.errors.forEach(err => {
      console.log(`❌ ERROR at line ${err.location?.line}:${err.location?.column}: ${err.text}`);
      if (err.location?.lineText) {
        console.log(`   ${err.location.lineText.substring(0, 120)}`);
      }
    });
  } else {
    console.log('❌ Unknown error:', e.message);
  }
}
