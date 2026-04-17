"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Check, Sparkles, Share2, ExternalLink } from "lucide-react"

export default function VoteConfirmationPage() {
  const params = useParams()
  const router = useRouter()
  const code = params.code as string

  const [showConfetti, setShowConfetti] = useState(true)
  const [voteData, setVoteData] = useState({
    choice: "🎯 Spot On",
    timestamp: "Just now",
    totalVotes: 0,
    distribution: [
      { label: "Spot On", value: 0 },
      { label: "Kinda", value: 0 },
      { label: "Way Off", value: 0 },
      { label: "Even Worse", value: 0 },
    ],
    userName: "Friend",
  })

  useEffect(() => {
    // Load vote data from sessionStorage
    const stored = sessionStorage.getItem('lastVote')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        const voteLabels: Record<string, string> = {
          'spot-on': '🎯 Spot On',
          'kinda': '🤔 Kinda',
          'way-off': '❌ Way Off',
          'even-worse': '😈 Even Worse!'
        }
        setVoteData(prev => ({
          ...prev,
          choice: voteLabels[data.choice] || data.choice,
          userName: data.creatorName || 'Friend'
        }))
      } catch (e) {
        console.error('Failed to load vote data:', e)
      }
    }

    // Fetch vote stats
    const fetchStats = async () => {
      try {
        const response = await fetch(`/api/poll/${code}/vote`)
        if (response.ok) {
          const data = await response.json()
          const total = data.total || 0
          if (total > 0) {
            const breakdown = data.breakdown || {}
            setVoteData(prev => ({
              ...prev,
              totalVotes: total,
              distribution: [
                { label: "Spot On", value: Math.round((breakdown.spot_on || 0) / total * 100) },
                { label: "Kinda", value: Math.round((breakdown.kinda || 0) / total * 100) },
                { label: "Way Off", value: Math.round((breakdown.way_off || 0) / total * 100) },
                { label: "Even Worse", value: Math.round((breakdown.even_worse || breakdown.even_better || 0) / total * 100) },
              ]
            }))
          }
        }
      } catch (e) {
        console.error('Failed to fetch stats:', e)
      }
    }
    fetchStats()

    const timer = setTimeout(() => {
      setShowConfetti(false)
    }, 5000)

    return () => clearTimeout(timer)
  }, [code])

  const handleShare = () => {
    const url = `https://aisocialmirror.com/poll/${code}`
    const text = `I just voted on ${voteData.userName}'s AI Mirror! See what AI thinks about you:`
    
    if (navigator.share) {
      navigator.share({ title: 'AISocialMirror', text, url })
    } else {
      navigator.clipboard.writeText(`${text} ${url}`)
      alert('Link copied!')
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AnimatePresence>
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-50">
            {[...Array(50)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  y: -20, 
                  x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400),
                  opacity: 1 
                }}
                animate={{ 
                  y: typeof window !== 'undefined' ? window.innerHeight + 20 : 800,
                  rotate: Math.random() * 360
                }}
                transition={{ 
                  duration: 2 + Math.random() * 2,
                  delay: Math.random() * 0.5
                }}
                className="absolute text-2xl"
              >
                {['🎉', '✨', '🎊', '💜', '⭐'][Math.floor(Math.random() * 5)]}
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      <div className="container mx-auto px-4 py-8 lg:py-16 max-w-2xl">
        {/* Celebration Header */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.6 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/50">
            <Check className="w-10 h-10 text-white" strokeWidth={3} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-2 bg-gradient-to-r from-white via-zinc-100 to-zinc-300 bg-clip-text text-transparent">
            Thanks for voting!
          </h1>
          <p className="text-zinc-400 text-lg">Your feedback helps us improve 🙏</p>
        </motion.div>

        {/* Vote Confirmation Card */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <Card className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400 mb-1">Your vote</p>
                <p className="text-2xl font-semibold">{voteData.choice}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-zinc-500">{voteData.timestamp}</p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Results Teaser */}
        {voteData.totalVotes > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-8"
          >
            <Card className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-zinc-300 font-medium">{voteData.totalVotes} friends have voted so far</p>
              </div>
              <div className="space-y-2 mb-4">
                {voteData.distribution.map((item, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">{item.label}</span>
                      <span className="text-zinc-500">{item.value}%</span>
                    </div>
                    <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.value}%` }}
                        transition={{ delay: 0.5 + index * 0.1, duration: 0.6 }}
                        className="h-full bg-gradient-to-r from-violet-500 to-purple-600"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button className="text-violet-400 hover:text-violet-300 text-sm font-medium flex items-center gap-1 transition-colors">
                See Full Results
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </Card>
          </motion.div>
        )}

        {/* Conversion Section - THE HOOK */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl border-2 border-violet-500/30 rounded-2xl p-6 md:p-8 shadow-2xl shadow-violet-500/20">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-purple-500/10 pointer-events-none" />

            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-violet-400" />
                <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Your Turn</span>
              </div>

              <h2 className="text-3xl md:text-4xl font-bold mb-3 text-balance leading-tight">
                Curious what AI sees in{" "}
                <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  YOU?
                </span>
              </h2>

              <p className="text-zinc-300 text-lg mb-6">Discover your IQ, EQ, and SQ scores</p>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { label: "IQ", color: "from-blue-500 to-cyan-500" },
                  { label: "EQ", color: "from-violet-500 to-purple-500" },
                  { label: "SQ", color: "from-emerald-500 to-green-500" },
                ].map((badge, index) => (
                  <motion.div
                    key={badge.label}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.6 + index * 0.1 }}
                    className={`bg-gradient-to-br ${badge.color} p-4 rounded-xl text-center`}
                  >
                    <p className="text-sm font-semibold text-white">{badge.label}</p>
                    <p className="text-xs text-white/80 mt-1">Score</p>
                  </motion.div>
                ))}
              </div>

              <div className="bg-white/[0.05] rounded-xl p-4 mb-6 border border-white/[0.08]">
                <p className="text-sm text-zinc-300">
                  <span className="font-semibold text-violet-400">Plus:</span> Your blind spots revealed
                </p>
              </div>

              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 0 0 rgba(139, 92, 246, 0)",
                    "0 0 0 8px rgba(139, 92, 246, 0.1)",
                    "0 0 0 0 rgba(139, 92, 246, 0)",
                  ],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  repeatDelay: 1,
                }}
                className="rounded-xl"
              >
                <Button
                  onClick={() => router.push('/')}
                  size="lg"
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold text-lg py-6 rounded-xl shadow-lg shadow-violet-500/50 transition-all duration-300"
                >
                  Get My Mirror 🪞
                </Button>
              </motion.div>
            </div>
          </Card>
        </motion.div>

        {/* Social Proof */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center mb-8"
        >
          <p className="text-sm text-zinc-500">
            Join <span className="font-semibold text-zinc-400">12,847+</span> people who've discovered their reflection
          </p>
        </motion.div>

        {/* Secondary Options */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm"
        >
          <button 
            onClick={handleShare}
            className="text-zinc-400 hover:text-zinc-300 flex items-center gap-2 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            Share this poll
          </button>
          <span className="hidden sm:inline text-zinc-700">•</span>
          <button className="text-zinc-400 hover:text-zinc-300 flex items-center gap-2 transition-colors">
            <ExternalLink className="w-4 h-4" />
            View {voteData.userName}'s results
          </button>
        </motion.div>
      </div>
    </div>
  )
}
