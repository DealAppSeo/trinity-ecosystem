"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Copy, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"

export default function PollCreationPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [question, setQuestion] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [pollCreated, setPollCreated] = useState(false)
  const [pollCode, setPollCode] = useState("")
  const [copied, setCopied] = useState(false)

  // Get data from sessionStorage (from results page)
  const [blindSpot, setBlindSpot] = useState("Your Blind Spot")
  const [insight, setInsight] = useState("AI detected patterns in your communication...")

  useEffect(() => {
    const stored = sessionStorage.getItem('mirrorResults')
    if (stored) {
      try {
        const results = JSON.parse(stored)
        const analysis = results.analysis || results
        if (analysis.blindSpot) {
          setBlindSpot(analysis.blindSpot.trait || "Your Blind Spot")
          setInsight(analysis.blindSpot.insight || "AI detected patterns in your communication...")
        }
      } catch (e) {
        console.error('Failed to load results:', e)
      }
    }
  }, [])

  const handleCreatePoll = async () => {
    setIsCreating(true)

    try {
      const stored = sessionStorage.getItem('mirrorResults')
      const results = stored ? JSON.parse(stored) : {}
      const analysis = results.analysis || results

      const response = await fetch('/api/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorName: name,
          question: question || "How accurate is this?",
          blindSpot: analysis.blindSpot?.trait || blindSpot,
          insight: analysis.blindSpot?.insight || insight,
          archetype: analysis.archetype?.name,
          archetypeEmoji: analysis.archetype?.emoji,
          iqScore: analysis.iq?.score,
          eqScore: analysis.eq?.score,
          sqScore: analysis.sq?.score,
        })
      })

      if (!response.ok) throw new Error('Failed to create poll')

      const data = await response.json()
      setPollCode(data.code)
      setPollCreated(true)

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      })
    } catch (error) {
      console.error('Poll creation failed:', error)
      const code = Math.random().toString(36).substring(2, 8).toUpperCase()
      setPollCode(code)
      setPollCreated(true)
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      })
    } finally {
      setIsCreating(false)
    }
  }

  const pollUrl = `https://aisocialmirror.com/poll/${pollCode}`

  const handleCopy = () => {
    navigator.clipboard.writeText(pollUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = (platform: string) => {
    const text = `AI analyzed me and found my blind spot. Do you agree? Vote here:`
    const encoded = encodeURIComponent(text)
    const encodedUrl = encodeURIComponent(pollUrl)

    const urls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encoded}&url=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      whatsapp: `https://wa.me/?text=${encoded} ${encodedUrl}`,
    }

    window.open(urls[platform], "_blank")
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-xl px-4 py-8 lg:py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <button 
            onClick={() => router.push('/results')}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Results
          </button>
          <h1 className="text-3xl font-bold text-balance">Ask Your Friends</h1>
        </motion.div>

        <AnimatePresence mode="wait">
          {!pollCreated ? (
            <motion.div
              key="creation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-2"
              >
                <h2 className="text-xl font-semibold text-balance">Let's see if your friends agree 🤔</h2>
                <p className="text-zinc-400 text-pretty">Share this poll and see how others perceive you</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="relative"
              >
                <div className="absolute -top-3 left-4 px-3 py-1 bg-violet-500/20 border border-violet-500/30 rounded-full">
                  <span className="text-xs text-violet-300 font-medium">Preview</span>
                </div>
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6 space-y-3">
                  <p className="text-sm text-zinc-400">AI says you are:</p>
                  <p className="text-2xl font-bold text-balance">{blindSpot}</p>
                  <p className="text-sm text-zinc-300 line-clamp-2 text-pretty">{insight}</p>
                  <div className="flex items-center gap-2 pt-2">
                    <div className="h-2 w-2 rounded-full bg-violet-500 animate-pulse"></div>
                    <span className="text-xs text-zinc-500">This is what your friends will see</span>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-zinc-300">
                    Your name (for the poll)
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your first name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] text-white placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-violet-500/20 rounded-xl h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="question" className="text-sm font-medium text-zinc-300">
                    Poll question (optional)
                  </Label>
                  <Input
                    id="question"
                    type="text"
                    placeholder="How accurate is this?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] text-white placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-violet-500/20 rounded-xl h-12"
                  />
                  <p className="text-xs text-zinc-500">Customize the question or use default</p>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <Button
                  onClick={handleCreatePoll}
                  disabled={!name || isCreating}
                  className="w-full h-14 text-base font-semibold bg-violet-500 hover:bg-violet-600 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    "Create Poll & Get Link"
                  )}
                </Button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className="text-center space-y-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="text-6xl"
                >
                  🎉
                </motion.div>
                <h2 className="text-2xl font-bold text-balance">Your poll is ready!</h2>
                <p className="text-zinc-400">Share it with your friends and see what they think</p>
              </div>

              <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6 space-y-4">
                <div className="text-center">
                  <p className="text-sm text-zinc-400 mb-2">Share Code</p>
                  <p className="text-4xl font-bold tracking-wider text-violet-400">{pollCode}</p>
                </div>

                <div className="pt-4 border-t border-white/[0.08]">
                  <Label htmlFor="url" className="text-xs text-zinc-400 mb-2 block">
                    Full URL
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="url"
                      value={pollUrl}
                      readOnly
                      className="bg-white/[0.03] border-white/[0.08] text-white rounded-xl flex-1"
                    />
                    <Button
                      onClick={handleCopy}
                      variant="outline"
                      size="icon"
                      className="shrink-0 h-10 w-10 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] rounded-xl"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4 text-zinc-400" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-zinc-400 text-center">Quick share</p>
                <div className="grid grid-cols-3 gap-3">
                  <Button
                    onClick={() => handleShare("twitter")}
                    variant="outline"
                    className="h-12 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] rounded-xl"
                  >
                    <span className="font-medium">Twitter</span>
                  </Button>
                  <Button
                    onClick={() => handleShare("linkedin")}
                    variant="outline"
                    className="h-12 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] rounded-xl"
                  >
                    <span className="font-medium">LinkedIn</span>
                  </Button>
                  <Button
                    onClick={() => handleShare("whatsapp")}
                    variant="outline"
                    className="h-12 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] rounded-xl"
                  >
                    <span className="font-medium">WhatsApp</span>
                  </Button>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  onClick={() => router.push(`/poll/${pollCode}`)}
                  variant="ghost"
                  className="w-full text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 rounded-xl"
                >
                  View Poll
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
