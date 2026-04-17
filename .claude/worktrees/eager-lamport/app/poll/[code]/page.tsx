"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type VoteOption = "spot-on" | "kinda" | "way-off" | "even-worse"

interface PollData {
  creatorName: string
  blindSpot: string
  evidence: string
  pollId: string
  isActive: boolean
  question?: string
}

export default function VotingPage() {
  const params = useParams()
  const router = useRouter()
  const code = params.code as string

  const [pollData, setPollData] = useState<PollData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedVote, setSelectedVote] = useState<VoteOption | null>(null)
  const [voterName, setVoterName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasVoted, setHasVoted] = useState(false)

  useEffect(() => {
    const fetchPoll = async () => {
      try {
        const response = await fetch(`/api/poll/${code}`)
        if (!response.ok) throw new Error('Poll not found')
        
        const data = await response.json()
        setPollData({
          creatorName: data.creatorName || data.creator_name || 'Friend',
          blindSpot: data.blindSpot || data.archetype || 'Their Blind Spot',
          evidence: data.insight || data.personalitySummary || data.personality_summary || '',
          pollId: data.id || code,
          isActive: true,
          question: data.question,
        })
      } catch (e) {
        setError('Poll not found or expired')
      } finally {
        setLoading(false)
      }
    }

    if (code) {
      fetchPoll()
    }
  }, [code])

  const voteOptions = [
    {
      id: "spot-on" as VoteOption,
      emoji: "🎯",
      label: "Spot On",
      color: "green",
      bgClass: "bg-green-500/10 border-green-500/50 hover:bg-green-500/20 hover:border-green-500",
      activeClass: "bg-green-500/30 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]",
    },
    {
      id: "kinda" as VoteOption,
      emoji: "🤔",
      label: "Kinda",
      color: "amber",
      bgClass: "bg-amber-500/10 border-amber-500/50 hover:bg-amber-500/20 hover:border-amber-500",
      activeClass: "bg-amber-500/30 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]",
    },
    {
      id: "way-off" as VoteOption,
      emoji: "❌",
      label: "Way Off",
      color: "blue",
      bgClass: "bg-blue-500/10 border-blue-500/50 hover:bg-blue-500/20 hover:border-blue-500",
      activeClass: "bg-blue-500/30 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]",
    },
    {
      id: "even-worse" as VoteOption,
      emoji: "😈",
      label: "Even Worse!",
      color: "rose",
      bgClass: "bg-rose-500/10 border-rose-500/50 hover:bg-rose-500/20 hover:border-rose-500",
      activeClass: "bg-rose-500/30 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]",
    },
  ]

  const handleVoteSelect = (voteId: VoteOption) => {
    setSelectedVote(voteId)
    if ("vibrate" in navigator) {
      navigator.vibrate(50)
    }
  }

  const handleSubmit = async () => {
    if (!selectedVote) return

    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/poll/${code}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rating: selectedVote, 
          voterName: voterName || "Anonymous" 
        })
      })

      if (!response.ok) throw new Error('Failed to submit vote')

      sessionStorage.setItem('lastVote', JSON.stringify({
        choice: selectedVote,
        voterName: voterName || "Anonymous",
        creatorName: pollData?.creatorName
      }))

      router.push(`/poll/${code}/thanks`)
    } catch (error) {
      console.error('Vote submission failed:', error)
      router.push(`/poll/${code}/thanks`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="text-5xl"
        >
          🪞
        </motion.div>
      </div>
    )
  }

  if (error || !pollData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-8 text-center"
        >
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-2xl font-bold text-white mb-2">Poll not found</h2>
          <p className="text-zinc-400 mb-6">This poll may have expired or doesn't exist</p>
          <Button 
            onClick={() => router.push('/')}
            className="w-full"
          >
            Get Your Own Mirror
          </Button>
        </motion.div>
      </div>
    )
  }

  if (!pollData.isActive) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-8 text-center"
        >
          <div className="text-6xl mb-4">⏰</div>
          <h2 className="text-2xl font-bold text-white mb-2">This poll has ended</h2>
          <p className="text-zinc-400 mb-6">Want to discover your own blind spots?</p>
          <Button onClick={() => router.push('/')} className="w-full">
            Start Your Own Mirror Scan
          </Button>
        </motion.div>
      </div>
    )
  }

  if (hasVoted) {
    const votedOption = voteOptions.find((opt) => opt.id === selectedVote)
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-8 text-center"
        >
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-white mb-2">You've already voted on this poll</h2>
          <p className="text-zinc-400 mb-4">
            Your vote: {votedOption?.emoji} {votedOption?.label}
          </p>
          <div className="space-y-3">
            <Button variant="outline" className="w-full bg-transparent">
              View Results
            </Button>
            <Button onClick={() => router.push('/')} className="w-full">
              Get Your Own Mirror
            </Button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl w-full"
      >
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🪞</div>
          <h1 className="text-3xl font-bold text-white text-balance">{pollData.creatorName}'s Mirror Check</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6 lg:p-8 mb-6"
        >
          <p className="text-zinc-400 text-sm mb-2">AI says {pollData.creatorName} is:</p>
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-4 text-pretty">{pollData.blindSpot}</h2>
          {pollData.evidence && (
            <p className="text-zinc-300 italic text-balance mb-6">"{pollData.evidence}"</p>
          )}
          <p className="text-zinc-200 font-medium text-lg">{pollData.question || "Do you agree?"}</p>
        </motion.div>

        <div className="grid grid-cols-2 gap-3 lg:gap-4 mb-6">
          {voteOptions.map((option, index) => (
            <motion.button
              key={option.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.05 }}
              onClick={() => handleVoteSelect(option.id)}
              className={`
                min-h-[80px] lg:min-h-[100px] rounded-2xl border-2 transition-all duration-200
                flex flex-col items-center justify-center gap-2 p-4
                focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-zinc-950
                ${selectedVote === option.id ? option.activeClass : option.bgClass}
              `}
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.02 }}
              aria-label={`Vote ${option.label}`}
              aria-pressed={selectedVote === option.id}
            >
              <span className="text-3xl lg:text-4xl">{option.emoji}</span>
              <span className="text-white font-semibold text-sm lg:text-base">{option.label}</span>
            </motion.button>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-4 mb-4"
        >
          <label htmlFor="voter-name" className="block text-zinc-400 text-sm mb-2">
            Your name (optional)
          </label>
          <Input
            id="voter-name"
            type="text"
            value={voterName}
            onChange={(e) => setVoterName(e.target.value)}
            placeholder="Anonymous"
            className="bg-white/[0.05] border-white/[0.08] text-white placeholder:text-zinc-500 focus:border-white/[0.2]"
          />
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          <Button
            onClick={handleSubmit}
            disabled={!selectedVote || isSubmitting}
            className={`
              w-full h-14 text-lg font-semibold rounded-2xl transition-all
              ${selectedVote && !isSubmitting ? "animate-pulse" : ""}
            `}
          >
            {isSubmitting ? "Submitting..." : "Cast My Vote"}
          </Button>
        </motion.div>

        <p className="text-center text-zinc-500 text-sm mt-6">
          Your vote helps {pollData.creatorName} discover their blind spots
        </p>
      </motion.div>
    </div>
  )
}
