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
  // Remove all instances of it at the top
  content = content.replace(/export const dynamic = 'force-dynamic';\n\n/g, '');
  content = content.replace(/export const dynamic = 'force-dynamic';\n/g, '');
  content = content.replace(/export const dynamic = 'force-dynamic';/g, '');
  
  // Append safely to the bottom
  content = content + "\n\nexport const dynamic = 'force-dynamic';\n";
  
  fs.writeFileSync(routePath, content);
  console.log(`Relocated dynamic export in: ${routePath}`);
});
console.log('Fixed AST placement for Next.js compiler.');
