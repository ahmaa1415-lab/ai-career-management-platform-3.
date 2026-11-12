import fs from 'fs';
import path from 'path';

function searchInDir(dir, query) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '.git') {
        searchInDir(full, query);
      }
    } else if (/\.(tsx|ts|js|jsx)$/.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.toLowerCase().includes(query.toLowerCase())) {
        console.log(`Found "${query}" in: ${full}`);
      }
    }
  }
}

console.log('Searching for "Application Workspace"...');
searchInDir('./app', 'Application Workspace');
console.log('Searching for "Auto-apply"...');
searchInDir('./app', 'Auto-apply');
