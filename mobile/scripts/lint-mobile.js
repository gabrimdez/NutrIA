const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const monitoredFiles = [
  'app/profile/weight-history.tsx',
  'app/add-meal/scanner.tsx',
  'app/(tabs)/chat.tsx',
  'src/components/ui/MealFoodItemRows.tsx',
  'src/components/ui/Surface.tsx',
  'src/components/ui/MealTypePickerSheet.tsx',
];

const literalChecks = [
  {
    name: 'style color literal',
    pattern: /\b(backgroundColor|borderColor|color|fill|stroke)\s*:\s*['"](rgba\([^'"]+\)|#[0-9A-Fa-f]{3,8})['"]/g,
  },
  {
    name: 'jsx color literal',
    pattern: /\b(color|fill|stroke)=\{?['"](rgba\([^'"]+\)|#[0-9A-Fa-f]{3,8})['"]\}?/g,
  },
];

const fileSpecificChecks = [
  {
    file: 'src/components/ui/Surface.tsx',
    pattern: /Platform\.select\([\s\S]*default:/m,
    message: 'Use shared elevation/platformBoxShadow instead of inline Platform.select defaults.',
  },
];

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const failures = [];

for (const relativeFile of monitoredFiles) {
  const absoluteFile = path.join(rootDir, relativeFile);
  const contents = fs.readFileSync(absoluteFile, 'utf8');

  for (const check of literalChecks) {
    for (const match of contents.matchAll(check.pattern)) {
      failures.push({
        file: relativeFile,
        line: lineNumberForIndex(contents, match.index ?? 0),
        message: `${check.name}: ${match[0]}`,
      });
    }
  }

  for (const check of fileSpecificChecks) {
    if (check.file !== relativeFile) continue;
    const match = contents.match(check.pattern);
    if (!match) continue;
    failures.push({
      file: relativeFile,
      line: lineNumberForIndex(contents, match.index ?? 0),
      message: check.message,
    });
  }
}

if (failures.length > 0) {
  console.error('Mobile lint found issues in guarded files:');
  for (const failure of failures) {
    console.error(`- ${failure.file}:${failure.line} ${failure.message}`);
  }
  process.exit(1);
}

console.log(`Mobile lint passed for ${monitoredFiles.length} guarded files.`);
