"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
// Trusted Service Client
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
const TARGET_URL = 'https://controller.aitrinitysymphony.com';
async function scoutLoop() {
    console.log(`🔭 Scout: Verifying target [${TARGET_URL}]...`);
    try {
        const start = Date.now();
        const res = await fetch(TARGET_URL);
        const latency = Date.now() - start;
        if (res.ok) {
            console.log(`✅ Target Online. Status: ${res.status}. Latency: ${latency}ms.`);
        }
        else {
            console.error(`🚨 Target Offline! Status: ${res.status}`);
            await reportTrauma(`Deployment Verification Failed: ${res.status} ${res.statusText}`, 'scout.ts');
        }
    }
    catch (err) {
        console.error('💥 Connection Failed:', err.message);
        await reportTrauma(`Deployment Unreachable: ${err.message}`, 'scout.ts');
    }
}
async function reportTrauma(message, source) {
    console.log('📡 Reporting trauma to Swarm Memory...');
    try {
        await supabase.from('trinity_runtime_errors').insert({
            error_message: message,
            url: TARGET_URL,
            component_stack: source,
            status: 'pending'
        });
        console.log('✅ Report logged.');
    }
    catch (dbErr) {
        console.error('⚠️ Failed to log to memory (Double Fault):', dbErr);
    }
}
// Run immediately
scoutLoop().catch(console.error);
