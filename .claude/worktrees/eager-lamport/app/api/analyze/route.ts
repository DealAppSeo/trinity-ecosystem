// ============================================
// AISOCIALMIRROR - API ROUTE
// app/api/analyze/route.ts
// 
// Features:
// - Calls MEL agent for real AI analysis
// - Fallback chain (MEL → APM → local)
// - Timeout handling
// - Distress response passthrough
// - Mirror Types and sharing
// ============================================

import { NextRequest, NextResponse } from "next/server";

// ============================================
// CONFIGURATION
// ============================================

// Fallback chain - try each in order
const AGENT_ENDPOINTS = [
  { name: 'MEL', url: 'https://trinity-mel-production.up.railway.app/analyze' },
  { name: 'APM', url: 'https://trinity-apm-production.up.railway.app/analyze' },
];

const TIMEOUT_MS = 25000; // 25 seconds max

// Brand terms
const BRAND_TERMS = {
  verified: "RepID Verified",
  ethical: "Ethical AI Analysis", 
  symphony: "Powered by Trinity Symphony",
  constitutional: "Constitutional AI Standards"
};

// ============================================
// HELPER: Fetch with timeout
// ============================================

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================
// HELPER: Call agents with fallback
// ============================================

async function callAgentWithFallback(body: object): Promise<{ data: any; agent: string; fallback: boolean }> {
  for (const endpoint of AGENT_ENDPOINTS) {
    try {
      console.log(`[API] Trying ${endpoint.name}...`);
      
      const response = await fetchWithTimeout(
        endpoint.url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        TIMEOUT_MS
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[API] ${endpoint.name} responded successfully`);
        return { data, agent: endpoint.name, fallback: false };
      }
      
      console.warn(`[API] ${endpoint.name} returned ${response.status}`);
    } catch (err: any) {
      console.warn(`[API] ${endpoint.name} failed: ${err.message}`);
    }
  }
  
  // All agents failed - return local fallback
  console.log('[API] All agents failed, using local fallback');
  return { data: generateLocalFallback(body), agent: 'LOCAL', fallback: true };
}

// ============================================
// HELPER: Local fallback analysis
// ============================================

function generateLocalFallback(body: any): object {
  const text = body.text || '';
  const words = text.split(/\s+/).length;
  
  // Simple heuristic scoring
  const positiveWords = (text.match(/love|great|happy|excited|grateful|amazing|wonderful|hope|joy/gi) || []).length;
  const analyticalWords = (text.match(/because|therefore|however|analyze|consider|reason|logic/gi) || []).length;
  const reflectiveWords = (text.match(/feel|believe|value|meaning|purpose|soul|spirit|heart/gi) || []).length;
  
  const baseScore = 65;
  const iqScore = Math.min(95, baseScore + analyticalWords * 3 + Math.min(words / 10, 15));
  const eqScore = Math.min(95, baseScore + positiveWords * 2 + reflectiveWords * 2);
  const sqScore = Math.min(95, baseScore + reflectiveWords * 3);
  
  return {
    summary: "I see someone taking time to reflect. That matters more than you might realize.",
    insight: "The act of writing clarifies thought. You're already doing the important work of self-examination.",
    
    iq: { 
      score: Math.round(iqScore), 
      label: "Analytical Intelligence",
      description: "Your thoughts come through with clarity.",
      strengths: ["Expression", "Structure"],
      color: "#22c55e"
    },
    eq: { 
      score: Math.round(eqScore), 
      label: "Emotional Intelligence",
      description: "Genuine feeling is present in your words.",
      strengths: ["Authenticity", "Awareness"],
      color: "#ef4444"
    },
    sq: { 
      score: Math.round(sqScore), 
      label: "Spiritual Intelligence",
      description: "Purpose and meaning underlie your expression.",
      strengths: ["Reflection", "Intention"],
      color: "#eab308"
    },
    
    mirrorType: {
      id: "reflective-soul",
      name: "The Reflective Soul",
      emoji: "🪞✨",
      description: "You lead with thoughtfulness and introspection."
    },
    
    blindSpot: {
      title: "What You Might Not See",
      insight: "Your willingness to examine yourself is rarer than you think. Many never pause to look inward."
    },
    
    hiddenStrength: {
      title: "Hidden Strength", 
      insight: "The courage to be vulnerable, even to an AI, shows emotional strength."
    },
    
    closing: "This is a preliminary reflection. For deeper insight, please try again in a moment when our full analysis is available.",
    
    fallback: true,
    fallbackReason: "Full analysis temporarily unavailable"
  };
}

// ============================================
// HELPER: Quick pre-analysis
// ============================================

function quickAnalysis(text: string): object {
  const words = text.split(/\s+/).length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length;
  
  const positiveWords = (text.match(/love|great|excellent|happy|excited|grateful|amazing|wonderful/gi) || []).length;
  const negativeWords = (text.match(/hate|terrible|awful|sad|angry|frustrated|disappointed|worried/gi) || []).length;
  const sentimentScore = Math.min(100, Math.max(0, 50 + (positiveWords * 5) - (negativeWords * 5)));
  
  return {
    stats: {
      words,
      sentences,
      avgWordsPerSentence: Math.round(words / Math.max(sentences, 1)),
      readingTime: `${Math.ceil(words / 200)} min`
    },
    quickInsights: [
      sentimentScore > 65 ? "✨ Your words carry positive energy" : 
        sentimentScore < 35 ? "💭 I sense some weight in your words" : 
        "🎯 Your tone is measured and balanced"
    ],
    previewScore: {
      clarity: Math.min(95, Math.max(55, 100 - Math.abs((words / Math.max(sentences, 1)) - 15) * 3)),
      warmth: Math.min(95, Math.max(55, sentimentScore)),
    }
  };
}

// ============================================
// MAIN API HANDLER
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { text, sharingLevel, storyMode, mode } = body;
    
    // Validation
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Please share what's on your mind." },
        { status: 400 }
      );
    }
    
    if (text.length < 50) {
      return NextResponse.json(
        { 
          error: "Text too short",
          message: `Just ${50 - text.length} more characters to unlock your reflection.`,
          minimum: 50,
          current: text.length
        },
        { status: 400 }
      );
    }
    
    // Call agent with fallback chain
    const level = sharingLevel || mode || "private_reflection";
    const { data, agent, fallback } = await callAgentWithFallback({
      text,
      sharingLevel: level,
      storyMode: storyMode || false
    });
    
    // Handle distress detection response from agent
    if (data.pauseFirst) {
      return NextResponse.json({
        ...data,
        branding: {
          poweredBy: BRAND_TERMS.symphony,
          standard: BRAND_TERMS.ethical
        }
      });
    }
    
    // Quick analysis for additional insights
    const quick = quickAnalysis(text);
    
    // Build response
    const latency = Date.now() - startTime;
    
    const response = {
      // Core analysis from agent
      summary: data.summary,
      insight: data.insight,
      analysis: data.rawAnalysis,
      
      // Scores with branding
      iq: {
        ...data.iq,
        verified: BRAND_TERMS.verified,
      },
      eq: {
        ...data.eq,
        verified: BRAND_TERMS.verified,
      },
      sq: {
        ...data.sq,
        verified: BRAND_TERMS.verified,
      },
      
      // Mirror type
      mirrorType: data.mirrorType,
      
      // Insights
      blindSpot: data.blindSpot,
      hiddenStrength: data.hiddenStrength,
      closing: data.closing,
      
      // Quick stats
      quickInsights: quick,
      
      // Branding
      branding: {
        poweredBy: BRAND_TERMS.symphony,
        verification: fallback ? "⏳ Preliminary" : `✓ ${BRAND_TERMS.verified}`,
        standard: BRAND_TERMS.ethical,
        agent: agent
      },
      
      // Meta
      meta: {
        analysisId: data.analysis_id,
        latencyMs: latency,
        agent: agent,
        provider: data.meta?.provider || 'unknown',
        sharingLevel: level,
        version: "2.0.0",
        constitutional: true,
        fallback: fallback
      }
    };
    
    return NextResponse.json(response);
    
  } catch (error: any) {
    console.error("[API] Analysis error:", error);
    
    return NextResponse.json(
      {
        error: "Analysis service temporarily unavailable",
        message: "Your words are safe. Please try again in a moment.",
        branding: {
          poweredBy: BRAND_TERMS.symphony,
          status: "Service recovering"
        }
      },
      { status: 503 }
    );
  }
}

// ============================================
// HEALTH CHECK
// ============================================

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const text = url.searchParams.get("text");
  
  if (!text) {
    // Check agent health
    const healthChecks = await Promise.all(
      AGENT_ENDPOINTS.map(async (endpoint) => {
        try {
          const res = await fetchWithTimeout(
            endpoint.url.replace('/analyze', '/health'),
            { method: 'GET' },
            5000
          );
          return { agent: endpoint.name, healthy: res.ok };
        } catch {
          return { agent: endpoint.name, healthy: false };
        }
      })
    );
    
    return NextResponse.json({
      status: "healthy",
      version: "2.0.0",
      agents: healthChecks,
      features: [
        "Mirror Types",
        "Distress Detection",
        "Fallback Chain",
        "RepID Verified",
        "Constitutional AI"
      ],
      branding: BRAND_TERMS
    });
  }
  
  // Quick analysis for preview
  const quick = quickAnalysis(text);
  return NextResponse.json(quick);
}
