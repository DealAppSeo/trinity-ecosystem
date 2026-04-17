import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// POST - Submit a vote
export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = params.code
    const body = await request.json()
    const { rating, voterName } = body

    // Get poll ID from code
    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .select('id')
      .eq('code', code)
      .single()

    if (pollError || !poll) {
      return NextResponse.json(
        { error: 'Poll not found' },
        { status: 404 }
      )
    }

    // Insert vote
    const { data, error } = await supabase
      .from('votes')
      .insert({
        poll_id: poll.id,
        rating: rating,
        voter_name: voterName || 'Anonymous',
      })
      .select()
      .single()

    if (error) {
      console.error('Vote insert error:', error)
      return NextResponse.json(
        { error: 'Failed to submit vote' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      voteId: data?.id 
    })

  } catch (error) {
    console.error('Vote submission error:', error)
    return NextResponse.json(
      { error: 'Failed to submit vote' },
      { status: 500 }
    )
  }
}

// GET - Get vote statistics
export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = params.code

    // Get poll ID from code
    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .select('id')
      .eq('code', code)
      .single()

    if (pollError || !poll) {
      return NextResponse.json(
        { error: 'Poll not found' },
        { status: 404 }
      )
    }

    // Get all votes for this poll
    const { data: votes, error } = await supabase
      .from('votes')
      .select('rating')
      .eq('poll_id', poll.id)

    if (error) {
      console.error('Fetch votes error:', error)
      return NextResponse.json({ total: 0, breakdown: {} })
    }

    // Count votes by rating
    const breakdown: Record<string, number> = {}
    votes?.forEach((vote) => {
      const key = vote.rating.replace('-', '_')
      breakdown[key] = (breakdown[key] || 0) + 1
    })

    return NextResponse.json({
      total: votes?.length || 0,
      breakdown,
    })

  } catch (error) {
    console.error('Get votes error:', error)
    return NextResponse.json({ total: 0, breakdown: {} })
  }
}
