const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoPath = process.cwd();
const outputFile = path.join(repoPath, 'audit_output.txt');
const out = fs.createWriteStream(outputFile);
const log = (str) => out.write(str + '\n');

// recursive file collection
const excludeDirs = ['node_modules', '.next', '.git', '.vscode', '.claude', 'tmp'];
const allFiles = [];
function walk(dir) {
    let files = [];
    try { files = fs.readdirSync(dir); } catch(e){ return; }
    for (const f of files) {
        if (excludeDirs.includes(f)) continue;
        const full = path.join(dir, f);
        try {
            const stat = fs.statSync(full);
            if (stat.isDirectory()) walk(full);
            else if (stat.isFile()) allFiles.push({ path: full, size: stat.size, mtime: stat.mtime });
        } catch(e) {}
    }
}
walk(repoPath);

log("PART 1 — FILE INVENTORY");
log("filepath | size | last_modified");
allFiles.forEach(f => {
    log(`${f.path} | ${f.size} | ${f.mtime.toISOString().substring(0,19)}`);
});
log("");

// Search lists
const p2 = ["constitutional","ConstitutionalAgent","belief","disbelief","uncertainty","pending_clarification","0.621","0.618","PHI","VERSION 8","VERSION 5","ANFIS","BDU","repid_score","repid_verified"];
const p3 = ["claim","status = 'doing'","status = 'pending'","status = 'failed'","status = 'done'","claimed_by","agent_name","task_type"];
const p4 = ["INSERT INTO","UPDATE trinity_tasks","UPDATE agent","supabase","SUPABASE",".from(",".insert(",".update("];
const p5 = ["directive","soul","SOUL","persona","PERSONA","instructions","system_prompt","systemPrompt","getPrompt","buildPrompt"];

const searchPatterns = [
    { title: "PART 2 — CONSTITUTIONAL LAYER FILES", terms: p2 },
    { title: "PART 3 — TASK CLAIMING LOGIC", terms: p3 },
    { title: "PART 4 — DATABASE WRITE LOCATIONS", terms: p4 },
    { title: "PART 5 — DIRECTIVE SOURCES", terms: p5 }
];

const fileContents = {};
allFiles.forEach(f => {
    // Only read readable code/text files, skip huge files > 2MB
    if(f.size < 2000000 && (f.path.match(/\.(js|ts|json|md|sql|env|env\.example|example|mjs|jsx|tsx|css)$/i) || f.path.includes('.env'))) {
        try { 
            // Also exclude package-lock.json to avoid garbage
            if (!f.path.includes('package-lock.json')) {
                fileContents[f.path] = fs.readFileSync(f.path, 'utf8');
            }
        } catch(e){}
    }
});

for (const sp of searchPatterns) {
    log(sp.title);
    log("filename | line number | exact matching line");
    for (const filepath in fileContents) {
        const lines = fileContents[filepath].split('\n');
        for (let i=0; i<lines.length; i++) {
            const l = lines[i];
            for (const term of sp.terms) {
                if (l.includes(term)) {
                    log(`${filepath} | ${i+1} | ${l.trim().substring(0, 150)}`);
                    break; // match once per line for section
                }
            }
        }
    }
    log("");
}

log("PART 6 — ENVIRONMENT AND CONFIG");
log("Variables / Hardcoded URLs");
for (const filepath in fileContents) {
    if (filepath.includes('.env') || filepath.endsWith('config.json') || filepath.includes('config') || filepath.endsWith('package.json')) {
        log(`\nConfig file: ${filepath}`);
        const lines = fileContents[filepath].split('\n');
        lines.forEach(l => {
            const match = l.match(/^([A-Z_0-9]+)=/);
            if (match) log(`  Var: ${match[1]}`);
        });
    }
    // Hardcoded URLs:
    const urlMatches = fileContents[filepath].match(/https?:\/\/[^\s"'`,)]+/g) || [];
    let uniqueUrls = [...new Set(urlMatches)];
    uniqueUrls.forEach(url => {
        if(!url.includes('localhost') && !url.includes('reactjs') && !filepath.includes('package-lock')) {
            log(`  URL in ${filepath}: ${url}`);
        }
    });
}
log("");

log("PART 7 — DUPLICATE OR CONFLICTING DEFINITIONS");
log("function/class name | file 1 | file 2");
const defs = {};
for (const filepath in fileContents) {
    const lines = fileContents[filepath].split('\n');
    lines.forEach(l => {
        const m = l.match(/(?:function\s+([a-zA-Z0-9_]+)\s*\()|(?:class\s+([a-zA-Z0-9_]+)\s*\{)/);
        if (m) {
            const name = m[1] || m[2];
            if (!defs[name]) defs[name] = [];
            if (!defs[name].includes(filepath)) defs[name].push(filepath);
        }
    });
}
for (const name in defs) {
    if (defs[name].length > 1) {
        log(`${name} | ${defs[name].join(' | ')}`);
    }
}
log("");

log("PART 8 — IMPORT/REQUIRE MAP");
log("(Skipped if constitutional-agent-base.js not found)");
let cabFile = Object.keys(fileContents).find(p => p.endsWith('constitutional-agent-base.js'));
if (cabFile) {
    let imports = fileContents[cabFile].match(/require\(['"]([^'"]+)['"]\)/g) || [];
    log(`Imports in ${cabFile}:`);
    imports.forEach(i => log('  ' + i));
} else {
    log("no constitutional-agent-base.js found in repo");
}
log("");

log("PART 9 — RECENT MODIFICATIONS");
const sorted = [...allFiles].sort((a,b) => b.mtime - a.mtime).slice(0, 20);
log("filepath | last_modified timestamp");
sorted.forEach(f => {
    log(`${f.path} | ${f.mtime.toISOString()}`);
});
log("");

log("PART 10 — ANOMALIES");
// Empty files
const emptyFiles = allFiles.filter(f => f.size === 0);
if(emptyFiles.length) {
    log("Empty files:");
    emptyFiles.forEach(f => log("  " + f.path));
}
// Identical content
const hashes = {};
const duplicates = [];
for (const filepath in fileContents) {
    // only check files size > 50 chars to avoid small noise
    if(fileContents[filepath].length > 50) {
        const h = crypto.createHash('md5').update(fileContents[filepath]).digest('hex');
        if (hashes[h]) {
             if (hashes[h] !== filepath) duplicates.push([hashes[h], filepath]);
        } else {
            hashes[h] = filepath;
        }
    }
}
if(duplicates.length) {
    log("Identical files:");
    duplicates.forEach(d => log(`  ${d[0]} === ${d[1]}`));
}

const suspiciousNames = allFiles.filter(f => /backup|old|copy|v2|fixed/i.test(path.basename(f.path)));
if (suspiciousNames.length) {
    log("Suspicious filenames:");
    suspiciousNames.forEach(f => log("  " + f.path));
}

log("TODO/FIXME broken behavior comments:");
for (const filepath in fileContents) {
    const lines = fileContents[filepath].split('\n');
    for (let i=0; i<lines.length; i++) {
        const l = lines[i];
        if (/(TODO|FIXME)/i.test(l) && /(broken|fail|error|fix|not working|bug)/i.test(l)) {
            log(`  ${filepath}:${i+1} | ${l.trim()}`);
        }
    }
}

out.end();
