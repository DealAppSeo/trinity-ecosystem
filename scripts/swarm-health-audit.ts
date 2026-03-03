import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface SwarmMetrics {
    timestamp: string;
    bft: {
        total_tasks: number;
        verified_3_3: number;
        failed_verification: number;
        consensus_rate: string;
    };
    anfis: {
        total_decisions: number;
        avg_quality_score: number;
        anfis_roi_savings: string; // 72.5% projected vs current
    };
    zkp: {
        total_agents: number;
        verified_dbt_count: number;
        proof_coverage: string;
    };
    wisdom: {
        total_insights: number;
        active_agents_sharing: number;
    };
}

async function runSwarmAudit() {
    console.log('\ufffd\ufffd\ufffd\ufffd Swarm Health Audit: Measuring Patent Evidence...');

    // 1. BFT Metrics
    const { data: bftData } = await supabase.from('trinity_tasks').select('status, verify_count');
    const totalTasks = bftData?.length || 0;
    const verified = bftData?.filter(t => t.verify_count >= 3 || t.status === 'verified').length || 0;
    const failed = bftData?.filter(t => t.status === 'failed').length || 0;

    // 2. ANFIS ROI
    const { data: anfisData } = await supabase.from('anfis_decisions').select('quality_score');
    const totalAnfis = anfisData?.length || 0;
    const avgQuality = totalAnfis > 0 ? anfisData!.reduce((a, b) => a + (b.quality_score || 0), 0) / totalAnfis : 0;

    // 3. ZKP Proofs
    const { data: registryData } = await supabase.from('trinity_agent_registry').select('agent_name, repid_proof');
    const totalAgents = registryData?.length || 0;
    const verifiedDBTs = registryData?.filter(a => a.repid_proof).length || 0;

    // 4. Wisdom Sharing
    const { data: insightData } = await supabase.from('trinity_artifacts').select('creator_agent').eq('artifact_type', 'insight');
    const totalInsights = insightData?.length || 0;
    const uniqueSharers = new Set(insightData?.map(i => i.creator_agent)).size;

    const report: SwarmMetrics = {
        timestamp: new Date().toISOString(),
        bft: {
            total_tasks: totalTasks,
            verified_3_3: verified,
            failed_verification: failed,
            consensus_rate: `${((verified / (totalTasks || 1)) * 100).toFixed(2)}%`
        },
        anfis: {
            total_decisions: totalAnfis,
            avg_quality_score: parseFloat(avgQuality.toFixed(2)),
            anfis_roi_savings: '72.5% (Projected)'
        },
        zkp: {
            total_agents: totalAgents,
            verified_dbt_count: verifiedDBTs,
            proof_coverage: `${((verifiedDBTs / (totalAgents || 1)) * 100).toFixed(2)}%`
        },
        wisdom: {
            total_insights: totalInsights,
            active_agents_sharing: uniqueSharers
        }
    };

    console.log('\n--- SWARM HEALTH REPORT ---');
    console.table({
        'BFT Consensus': report.bft.consensus_rate,
        'ANFIS Quality': report.anfis.avg_quality_score,
        'ZKP Verification': report.zkp.proof_coverage,
        'Wisdom Sharing': report.wisdom.total_insights
    });

    // Save history for "measurable difference" tracking
    const reportPath = path.resolve(process.cwd(), 'docs', 'reports', `health_audit_${Date.now()}.json`);
    if (!fs.existsSync(path.dirname(reportPath))) fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n\ufffd\ufffd Report saved to: ${reportPath}`);
    return report;
}

runSwarmAudit();
