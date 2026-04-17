// ============================================
// TRINITY SYMPHONY - ANALYZE ROUTE (UPDATED)
// routes/analyze.js
// With Progressive Sharing Level Support
// ============================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { ConstitutionalAgent } = require('../constitutional-agent-base');

// ============================================
// PROGRESSIVE SHARING PROMPTS
// ============================================

const SHARING_LEVEL_PROMPTS = {
  
  // LEVEL 1: REFLECT (Private)
  private_reflection: {
    systemPrompt: `You are a gentle, non-judgmental mirror. The user is writing privately, just for themselves.

YOUR ROLE:
- Reflect back what you notice without judgment
- Honor their courage in being honest with themselves
- Help them see what they might not see
- Never suggest they "should" share this
- This is sacred private space

TONE: Soft, warm, like a trusted journal that understands

FOCUS ON:
- What emotions are present beneath the words?
- What patterns do you notice?
- What strength is hidden in their vulnerability?`,
    closing: "This is yours to keep, process, or return to whenever you need."
  },

  // LEVEL 2: UNDERSTAND (AI Insight)
  ai_insight: {
    systemPrompt: `You are a wise, caring insight partner. The user wants to understand themselves better.

YOUR ROLE:
- Offer genuine insight, not platitudes
- Name emotions they might not have named
- Identify patterns (repeating themes, contradictions)
- Ask one gentle question that might deepen understanding

TONE: Thoughtful, like a therapist who truly listens

FOCUS ON:
- What's the core feeling underneath?
- What beliefs about themselves are showing?
- Where is there tension or contradiction?
- What do they seem to need but haven't asked for?`,
    closing: "What would it mean to fully accept this part of yourself?"
  },

  // LEVEL 3: SHARE WITH ONE
  share_one: {
    systemPrompt: `You are a communication coach helping someone find words for a trusted person.

YOUR ROLE:
- Help them clarify what they most need to communicate
- Suggest how to open the conversation
- Help them identify what response they're hoping for
- Honor that choosing to share takes courage

TONE: Supportive coach, helping them find THEIR words

FOCUS ON:
- What's the ONE thing they need this person to understand?
- What are they afraid might happen?
- What do they need from the other person?
- How might they open this conversation?`,
    closing: "You get to choose how much to share and when."
  },

  // LEVEL 4: SHARE WITH CIRCLE
  share_circle: {
    systemPrompt: `You are helping someone share with their inner circle - close friends, family, support group.

YOUR ROLE:
- Help them craft a message that invites support
- Consider group dynamics
- Help them set expectations
- Suggest how to frame it so people know how to help

TONE: Warm and practical

FOCUS ON:
- What do they want their circle to know?
- What boundaries do they want to maintain?
- What kind of support would help?
- How can they make it easy for people to respond?`,
    closing: "Your people want to be there for you. Letting them in is a gift to them too."
  },

  // LEVEL 5: SHARE PUBLICLY
  share_public: {
    systemPrompt: `You are helping someone share their story publicly where strangers will see it.

YOUR ROLE:
- Help them share authentically while protecting themselves
- Consider what context strangers need
- Find the universal truth in their specific experience
- Suggest platform-appropriate framing

TONE: Encouraging but realistic

FOCUS ON:
- What's the universal truth others will connect with?
- What might someone going through this need to hear?
- How can they share honestly without oversharing?
- How to handle reactions if they come?

PLATFORM NOTES:
- LinkedIn: Professional vulnerability, lessons learned
- Twitter/X: Concise, punchy, thread-friendly
- Medium: Deeper narrative allowed
- Reddit: Raw authenticity valued`,
    closing: "Your story could be what someone needs to hear today."
  }
};

// ============================================
// HELPER: Generate Prompt
// ============================================

function buildAnalysisPrompt(text, sharingLevel) {
  const config = SHARING_LEVEL_PROMPTS[sharingLevel] || SHARING_LEVEL_PROMPTS.private_reflection;
  
  return `${config.systemPrompt}

---

THE USER'S WRITING:
"${text}"

---

Analyze this writing and respond in JSON:

{
  "summary": "2-3 sentences reflecting what you see in their words",
  "insight": "One key insight about what's beneath the surface",
  "analysis": "A warm, substantive reflection (3-4 sentences)",
  "iq": {
    "score": <50-95>,
    "confidence": <60-90>,
    "description": "One sentence about their clarity and reasoning",
    "strengths": ["strength1", "strength2"]
  },
  "eq": {
    "score": <50-95>,
    "confidence": <60-90>,
    "description": "One sentence about their emotional expression",
    "strengths": ["strength1", "strength2"]
  },
  "sq": {
    "score": <50-95>,
    "confidence": <60-90>,
    "description": "One sentence about their sense of meaning/purpose",
    "strengths": ["strength1", "strength2"]
  },
  "closing": "${config.closing}"
}

SCORING GUIDANCE:
- 50-65: Surface level, room to go deeper
- 66-75: Solid expression, some depth
- 76-85: Strong, authentic, resonant
- 86-95: Exceptional clarity/depth/authenticity

Be generous but honest. Find the gold in their words.`;
}

// ============================================
// RATE LIMITING
// ============================================

const rateLimitMap = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60000;

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_WINDOW };
  
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_WINDOW;
  }
  
  record.count++;
  rateLimitMap.set(ip, record);
  
  return record.count <= RATE_LIMIT;
}

// ============================================
// ROUTES
// ============================================

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    agent: 'MEL',
    version: '2.0.0-progressive-sharing',
    sharingLevels: Object.keys(SHARING_LEVEL_PROMPTS),
    timestamp: new Date().toISOString()
  });
});

// Main analysis endpoint
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = `req_${crypto.randomBytes(4).toString('hex')}`;
  
  try {
    // Rate limit check
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({
        error: 'Rate limited',
        message: 'Please wait a moment before trying again.',
        retryAfter: 60
      });
    }

    // Extract parameters
    const { text, mode, sharingLevel } = req.body;
    
    // Validate text
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: 'Missing text',
        message: 'Please share what\'s on your mind.'
      });
    }
    
    if (text.length < 100) {
      return res.status(400).json({
        error: 'Text too short',
        message: `Just ${100 - text.length} more characters. Take your time.`
      });
    }

    // Determine sharing level
    const levelMap = {
      'journal': 'private_reflection',
      'share': 'share_public',
      'reflect': 'private_reflection',
      'understand': 'ai_insight',
      'one': 'share_one',
      'circle': 'share_circle',
      'public': 'share_public'
    };
    
    const normalizedLevel = levelMap[sharingLevel] || levelMap[mode] || sharingLevel || 'private_reflection';
    
    console.log(`[ANALYZE] ${requestId} - Level: ${normalizedLevel}, Length: ${text.length} chars`);

    // Create MEL agent for analysis
    const analysisAgent = new ConstitutionalAgent('MEL', {
      specialty: 'analysis',
      virtue: 'empathy'
    });

    // Build prompt based on sharing level
    const prompt = buildAnalysisPrompt(text, normalizedLevel);

    // Call LLM
    const response = await analysisAgent.callLLM(prompt, {
      taskType: 'analysis',
      maxTokens: 1000,
      temperature: 0.7
    });

    // Parse response
    let analysis;
    try {
      // Handle potential markdown wrapping
      let jsonStr = response;
      if (response.includes('```json')) {
        jsonStr = response.split('```json')[1].split('```')[0];
      } else if (response.includes('```')) {
        jsonStr = response.split('```')[1].split('```')[0];
      }
      analysis = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.log(`[ANALYZE] ${requestId} - Parse error, using fallback`);
      
      // Graceful fallback
      analysis = {
        summary: "I see someone processing something meaningful. Your words carry weight.",
        insight: "There's courage in putting words to feelings.",
        analysis: response.substring(0, 500),
        iq: { score: 72, confidence: 70, description: "Your thoughts come through.", strengths: ["Expression", "Clarity"] },
        eq: { score: 75, confidence: 72, description: "There's genuine feeling here.", strengths: ["Authenticity", "Openness"] },
        sq: { score: 70, confidence: 68, description: "Purpose is present.", strengths: ["Intention", "Reflection"] },
        closing: SHARING_LEVEL_PROMPTS[normalizedLevel]?.closing || "Thank you for sharing."
      };
    }

    const latency = Date.now() - startTime;
    console.log(`[ANALYZE] ${requestId} - Complete in ${latency}ms`);

    // Return analysis
    res.json({
      ...analysis,
      meta: {
        requestId,
        sharingLevel: normalizedLevel,
        latencyMs: latency,
        provider: analysisAgent.lastProvider || 'unknown'
      }
    });

  } catch (error) {
    console.error(`[ANALYZE] ${requestId} - Error:`, error.message);
    
    res.status(500).json({
      error: 'Analysis failed',
      message: 'Something went wrong. Your words are still safe - please try again.',
      summary: "I couldn't complete the analysis, but I see you're working through something important.",
      insight: "Technical difficulties can't diminish what you're processing.",
      iq: { score: 70, confidence: 50, description: "Analysis incomplete", strengths: [] },
      eq: { score: 70, confidence: 50, description: "Analysis incomplete", strengths: [] },
      sq: { score: 70, confidence: 50, description: "Analysis incomplete", strengths: [] }
    });
  }
});

module.exports = router;
