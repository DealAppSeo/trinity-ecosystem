const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      filelist = walkSync(dirFile, filelist);
    } else if (file === 'route.ts') {
      filelist.push(dirFile);
    }
  });
  return filelist;
};

const routes = walkSync(path.join(__dirname, 'app', 'api'));

routes.forEach(routePath => {
  let content = fs.readFileSync(routePath, 'utf8');
  if (!content.includes('force-dynamic')) {
    fs.writeFileSync(routePath, "export const dynamic = 'force-dynamic';\n\n" + content);
    console.log(`Patched: ${routePath}`);
  }
});

console.log('All API route nodes secured with edge dynamic execution bounds.');
