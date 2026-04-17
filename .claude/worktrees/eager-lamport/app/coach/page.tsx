"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Target, Lock, Unlock, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Trait = {
  id: string
  name: string
  emoji: string
  locked: boolean
  tips: string[]
  exercises: Array<{ title: string; description: string }>
}

const traits: Trait[] = [
  {
    id: "confident",
    name: "More Confident",
    emoji: "💪",
    locked: false,
    tips: [
      'Use "I believe" instead of "I think" when stating opinions',
      "Pause 2 seconds before responding to show thoughtfulness",
      'Replace "just" with confident alternatives in your speech',
      "Maintain eye contact for 3-5 seconds during conversations",
      "Stand or sit with an open posture - shoulders back, head up",
    ],
    exercises: [
      {
        title: "Power Posing",
        description:
          "Spend 2 minutes in a confident pose (hands on hips, chest out) before important meetings or conversations.",
      },
      {
        title: "Vocal Variety Practice",
        description: "Record yourself speaking and practice lowering your pitch slightly and reducing filler words.",
      },
      {
        title: "Compliment Acceptance",
        description: 'When someone compliments you, simply say "Thank you" without deflecting or minimizing.',
      },
    ],
  },
  {
    id: "empathetic",
    name: "More Empathetic",
    emoji: "💙",
    locked: true,
    tips: [
      'Reflect emotions: "It sounds like you\'re feeling..." before offering solutions',
      'Ask "How are you feeling about that?" instead of jumping to advice',
      "Practice active listening by summarizing what others say before responding",
      "Notice body language and tone, not just words",
      "Share your own vulnerable moments to create connection",
    ],
    exercises: [
      {
        title: "Emotion Labeling",
        description: "In conversations, practice naming the emotion you think the other person is experiencing.",
      },
      {
        title: "Listening Without Planning",
        description:
          "Focus entirely on understanding, not on what you'll say next. Count to 3 after they finish before speaking.",
      },
    ],
  },
  {
    id: "approachable",
    name: "More Approachable",
    emoji: "😊",
    locked: true,
    tips: [
      "Smile genuinely when making eye contact with others",
      "Keep your arms uncrossed and body language open",
      "Ask open-ended questions to invite conversation",
      "Use people's names when speaking to them",
      "Offer small acts of kindness without expecting anything in return",
    ],
    exercises: [
      {
        title: "Stranger Smile Practice",
        description: "Make eye contact and smile at 5 strangers today. Notice how it changes interactions.",
      },
      {
        title: "Conversation Starters",
        description: "Prepare 3 friendly questions you can use to start conversations in various settings.",
      },
    ],
  },
  {
    id: "intelligent",
    name: "More Intelligent",
    emoji: "🧠",
    locked: true,
    tips: [
      "Ask thoughtful questions that show you're thinking deeply",
      "Reference specific examples and data when making points",
      "Say \"I don't know, but I'll find out\" instead of guessing",
      "Use precise vocabulary without being pretentious",
      "Connect ideas across different domains to show broad thinking",
    ],
    exercises: [
      {
        title: "Question Journaling",
        description: "Write down 3 thoughtful questions each day about topics you encounter.",
      },
      {
        title: "Concept Mapping",
        description: "Practice explaining complex ideas in simple terms to someone unfamiliar with the topic.",
      },
    ],
  },
  {
    id: "charismatic",
    name: "More Charismatic",
    emoji: "✨",
    locked: true,
    tips: [
      "Tell engaging stories with vivid details and emotional stakes",
      "Make others feel like the most interesting person in the room",
      "Use animated facial expressions that match your words",
      "Create mystery by not revealing everything at once",
      "Express genuine enthusiasm for topics you care about",
    ],
    exercises: [
      {
        title: "Story Bank",
        description: "Prepare 3 short personal stories with clear beginnings, middles, and endings.",
      },
      {
        title: "Energy Matching",
        description: "Practice matching and then slightly elevating the energy of people you're talking to.",
      },
    ],
  },
  {
    id: "authentic",
    name: "More Authentic",
    emoji: "🎭",
    locked: true,
    tips: [
      "Share your real opinion, especially when it differs from the group",
      "Admit mistakes openly and take responsibility",
      "Talk about your passions without apologizing",
      'Set boundaries clearly: "I\'m not comfortable with that"',
      "Let your unique quirks and interests show naturally",
    ],
    exercises: [
      {
        title: "Vulnerability Practice",
        description: "Share one genuine struggle or uncertainty with someone you trust today.",
      },
      {
        title: "Opinion Articulation",
        description: "Practice stating your true opinion on 3 topics before checking what others think.",
      },
    ],
  },
]

export default function PerceptionCoachPage() {
  const router = useRouter()
  const [selectedTrait, setSelectedTrait] = useState<Trait | null>(null)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [shareCount, setShareCount] = useState(1)
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set())

  const handleTraitSelect = (trait: Trait) => {
    if (trait.locked && !isUnlocked) {
      return
    }
    setSelectedTrait(trait)
  }

  const handleShareClick = () => {
    const url = 'https://aisocialmirror.com/coach'
    const text = "I'm leveling up how I'm perceived with AI coaching. Check it out:"
    
    if (navigator.share) {
      navigator.share({ title: 'Perception Coach', text, url })
    } else {
      navigator.clipboard.writeText(`${text} ${url}`)
      alert('Link copied!')
    }

    if (shareCount < 3) {
      setShareCount((prev) => prev + 1)
      localStorage.setItem('asm_shares', String(shareCount + 1))
      if (shareCount + 1 >= 3) {
        setIsUnlocked(true)
      }
    }
  }

  const toggleExercise = (exerciseTitle: string) => {
    setCompletedExercises((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(exerciseTitle)) {
        newSet.delete(exerciseTitle)
      } else {
        newSet.add(exerciseTitle)
      }
      return newSet
    })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => router.push('/results')}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Mirror
            </button>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-violet-400" />
              <span className="font-semibold">Perception Coach</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 lg:py-12">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-4xl font-bold tracking-tight lg:text-5xl">Level up how you're perceived</h2>
          <p className="text-lg text-zinc-400 lg:text-xl">Choose a trait to improve and get personalized advice</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl sticky top-24 p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">Select a Trait</h3>
              <div className="grid gap-3">
                {traits.map((trait) => (
                  <motion.button
                    key={trait.id}
                    onClick={() => handleTraitSelect(trait)}
                    disabled={trait.locked && !isUnlocked}
                    whileHover={trait.locked && !isUnlocked ? {} : { scale: 1.02 }}
                    whileTap={trait.locked && !isUnlocked ? {} : { scale: 0.98 }}
                    className={cn(
                      "bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl relative overflow-hidden p-4 text-left transition-all",
                      selectedTrait?.id === trait.id && "ring-2 ring-violet-500 shadow-lg shadow-violet-500/20",
                      trait.locked && !isUnlocked && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{trait.emoji}</span>
                      <div className="flex-1">
                        <div className="font-medium">{trait.name}</div>
                        <div className="text-xs text-zinc-500">
                          {trait.locked && !isUnlocked ? (
                            <span className="flex items-center gap-1">
                              <Lock className="h-3 w-3" />
                              Unlock
                            </span>
                          ) : !trait.locked ? (
                            <span className="flex items-center gap-1">
                              <Unlock className="h-3 w-3" />
                              Free
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Unlock className="h-3 w-3" />
                              Unlocked
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {trait.locked && !isUnlocked && <div className="absolute inset-0 backdrop-blur-[2px]" />}
                  </motion.button>
                ))}
              </div>

              {!isUnlocked && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl mt-6 p-4"
                >
                  <div className="mb-3 text-center">
                    <p className="mb-1 text-sm font-medium">Share to unlock full coach access</p>
                    <div className="text-xs text-zinc-400">Progress: {shareCount}/3 shares</div>
                  </div>
                  <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/[0.08]">
                    <motion.div
                      initial={{ width: "33%" }}
                      animate={{ width: `${(shareCount / 3) * 100}%` }}
                      transition={{ duration: 0.5 }}
                      className="h-full bg-gradient-to-r from-violet-500 to-purple-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleShareClick} size="sm" className="flex-1 bg-violet-600 hover:bg-violet-700">
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {selectedTrait ? (
                <motion.div
                  key={selectedTrait.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                      <span>💡</span>
                      Tips for {selectedTrait.name}
                    </h3>
                    <ul className="space-y-3">
                      {selectedTrait.tips.map((tip, index) => (
                        <motion.li
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex gap-3 text-zinc-300"
                        >
                          <span className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-semibold text-violet-400">
                            {index + 1}
                          </span>
                          <span className="leading-relaxed">{tip}</span>
                        </motion.li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                      <span>🏋️</span>
                      Practice Exercises
                    </h3>
                    <div className="space-y-4">
                      {selectedTrait.exercises.map((exercise, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 + 0.5 }}
                          className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-4"
                        >
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <h4 className="font-semibold text-violet-400">{exercise.title}</h4>
                            <button
                              onClick={() => toggleExercise(exercise.title)}
                              className={cn(
                                "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors",
                                completedExercises.has(exercise.title)
                                  ? "border-violet-500 bg-violet-500"
                                  : "border-zinc-600 bg-transparent hover:border-violet-500",
                              )}
                            >
                              {completedExercises.has(exercise.title) && (
                                <motion.svg
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="h-3 w-3 text-white"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={3}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </motion.svg>
                              )}
                            </button>
                          </div>
                          <p className="text-sm leading-relaxed text-zinc-400">{exercise.description}</p>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6 text-center">
                    <p className="text-sm text-zinc-500">Coming soon: Track your progress over time</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl flex min-h-[400px] items-center justify-center p-12 text-center"
                >
                  <div>
                    <div className="mb-4 text-6xl">🎯</div>
                    <h3 className="mb-2 text-xl font-semibold text-zinc-400">Select a trait to begin</h3>
                    <p className="text-sm text-zinc-500">
                      Choose a trait from the left to see personalized tips and exercises
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  )
}
