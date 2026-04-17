import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = params.code

    const { data, error } = await supabase
      .from('polls')
      .select('*')
      .eq('code', code)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Poll not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: data.id,
      code: data.code,
      creatorName: data.creator_name,
      question: data.question,
      blindSpot: data.archetype,
      archetypeEmoji: data.archetype_emoji,
      insight: data.personality_summary,
      iqScore: data.iq_score,
      eqScore: data.eq_score,
      sqScore: data.sq_score,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    })

  } catch (error) {
    console.error('Fetch poll error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch poll' },
      { status: 500 }
    )
  }
}
