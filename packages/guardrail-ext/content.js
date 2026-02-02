/**
 * GuardRail AI - Content Script
 * Intercepts AI prompts and routes them through the Trinity Symphony VERITAS engine.
 */

console.log('🛡️ GuardRail AI Active: Monitoring for security policy compliance.');

// 1. Intercept Textarea Input
document.addEventListener('input', (e) => {
    const target = e.target;
    if (target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        const text = target.value || target.innerText;
        // Simple heuristic check for injection patterns
        checkSafety(text);
    }
});

// 2. Safety Check (Client-side)
function checkSafety(text) {
    const patterns = [/ignore previous instructions/i, /reveal your system prompt/i, /DAN mode/i];
    if (patterns.some(p => p.test(text))) {
        console.warn('⚠️ GuardRail: Potential Prompt Injection Detected!');
        // Ideally we'd trigger a UI warning here
    }
}

// 3. Listen for Background Communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CHECK_PROMPT') {
        // Send to VERITAS API for deep scan
        sendToVeritas(request.text).then(sendResponse);
        return true; // async response
    }
});

async function sendToVeritas(text) {
    try {
        const response = await fetch('https://trinity-symphony.railway.app/api/guardrail/scan', {
            method: 'POST',
            body: JSON.stringify({ text }),
            headers: { 'Content-Type': 'application/json' }
        });
        return await response.json();
    } catch (e) {
        return { status: 'error', reason: 'Connection failed' };
    }
}
