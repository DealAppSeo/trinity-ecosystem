import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      creatorName,
      question,
      blindSpot,
      insight,
      archetype,
      archetypeEmoji,
      iqScore,
      eqScore,
      sqScore,
    } = body

    const code = generateCode()

    // Try to insert into Supabase
    const { data, error } = await supabase
      .from('polls')
      .insert({
        code,
        creator_name: creatorName,
        question: question || 'How accurate is this?',
        archetype: blindSpot || archetype || 'Unknown',
        archetype_emoji: archetypeEmoji || '🪞',
        personality_summary: insight || '',
        iq_score: iqScore || null,
        eq_score: eqScore || null,
        sq_score: sqScore || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      // Return code anyway for graceful degradation
      return NextResponse.json({ code, id: null, mock: true })
    }

    return NextResponse.json({ 
      code, 
      id: data?.id,
      success: true 
    })

  } catch (error) {
    console.error('Poll creation error:', error)
    // Fallback - still return a code
    const fallbackCode = generateCode()
    return NextResponse.json({ code: fallbackCode, mock: true })
  }
}
