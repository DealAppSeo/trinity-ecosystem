
const fs = require('fs');
const path = require('path');

const baseDir = 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem';

function checkFileContains(relPath, pattern) {
    const fullPath = path.join(baseDir, relPath);
    if (!fs.existsSync(fullPath)) {
        console.log(`❌ FILE MISSING: ${relPath}`);
        return false;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.match(pattern)) {
        console.log(`✅ VERIFIED: ${relPath} contains pattern ${pattern}`);
        return true;
    } else {
        console.log(`❌ FAILED: ${relPath} missing pattern ${pattern}`);
        return false;
    }
}

async function verify() {
    console.log('--- Phase 4.5 Verification Hub ---');

    // Task 0: Patent Evidence
    const csvExists = fs.existsSync(path.join(baseDir, 'patent-evidence', 'retrieval_logs.csv'));
    console.log(csvExists ? '✅ Task 0: retrieval_logs.csv exists' : '❌ Task 0: retrieval_logs.csv missing');

    // Task 1: Telegram HITL Bridge
    checkFileContains('lib/agent/ConstitutionalAgent.ts', /HITLDispatcher\.dispatchToHITL/);
    checkFileContains('lib/telegram/bot.ts', /HITLCallbackHandler\.handleTelegramCallback/);

    // Task 2: RepID Chain
    checkFileContains('lib/agent/ConstitutionalAgent.ts', /compute_bids.*agent_repid_score/);

    // Task 3: Controller Login Gate
    checkFileContains('app/controller/login/page.tsx', /Initialize Control Chain/);
    checkFileContains('middleware.ts', /isControllerSubdomain/);
    checkFileContains('middleware.ts', /NextResponse\.redirect/);

    console.log('--- Verification Complete ---');
}

verify();
