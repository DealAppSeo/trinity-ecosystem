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
dotenv.config({ path: '.env.local' });
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function verify() {
    console.log('Checking for trinity_artifacts table...');
    const { data, error } = await supabase
        .from('trinity_artifacts')
        .select('count', { count: 'exact', head: true });
    if (error) {
        console.error('Error checking trinity_artifacts:', error.message);
        // If error, try to list all tables (requires specific permissions usually not available, but we can try to insert/select known tables)
        console.log('Attempting to guess other table names...');
    }
    else {
        console.log(`Found trinity_artifacts table with ${data} entries (head check). count result:`, data);
        // Let's see one row to understand schema
        const { data: rows, error: rowError } = await supabase
            .from('trinity_artifacts')
            .select('*')
            .limit(1);
        if (rows && rows.length > 0) {
            console.log('Sample row keys:', Object.keys(rows[0]));
            console.log('Sample row:', rows[0]);
        }
        else {
            console.log('Table exists but is empty.');
        }
    }
}
verify();
