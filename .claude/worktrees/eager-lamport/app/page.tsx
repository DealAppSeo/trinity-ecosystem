"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Loader2, Brain, Heart, Sparkles, Copy, Save, Mic, ChevronDown, ChevronUp, Check } from "lucide-react"
import { QRCodeComponent } from "@/components/qr-code"

const STORAGE_KEYS = {
  DRAFT: "asm_draft",
  DRAFT_TIMESTAMP: "asm_draft_timestamp",
  SHOWN_PROMPTS: "asm_shown_prompts",
  SANCTUARY_LAST: "asm_sanctuary_last",
}

const saveDraft = (text: string) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEYS.DRAFT, text)
    localStorage.setItem(STORAGE_KEYS.DRAFT_TIMESTAMP, Date.now().toString())
  }
}

const getDraft = () => {
  if (typeof window !== "undefined") {
    const draft = localStorage.getItem(STORAGE_KEYS.DRAFT)
    const timestamp = localStorage.getItem(STORAGE_KEYS.DRAFT_TIMESTAMP)
    if (draft && timestamp) {
      const age = Date.now() - Number.parseInt(timestamp)
      if (age < 24 * 60 * 60 * 1000) {
        // < 24 hours
        return draft
      }
    }
  }
  return null
}

const clearDraft = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEYS.DRAFT)
    localStorage.removeItem(STORAGE_KEYS.DRAFT_TIMESTAMP)
  }
}

const SANCTUARY_MESSAGES = [
  "Pausing with your words...",
  "There's courage in what you've written...",
  "Sensing what's beneath the surface...",
  "Your honesty matters...",
]

const getRandomSanctuaryMessage = () => {
  if (typeof window !== "undefined") {
    const lastMessage = localStorage.getItem(STORAGE_KEYS.SANCTUARY_LAST)
    const available = SANCTUARY_MESSAGES.filter((m) => m !== lastMessage)
    const selected = available[Math.floor(Math.random() * available.length)]
    localStorage.setItem(STORAGE_KEYS.SANCTUARY_LAST, selected)
    return selected
  }
  return SANCTUARY_MESSAGES[0]
}

type Mode = "journal" | "someone" | "public"

export default function Home() {
  const [text, setText] = useState("")
  const [originalText, setOriginalText] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<Mode>("journal")
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const [savedDraft, setSavedDraft] = useState<string | null>(null)
  const [showSavedIndicator, setShowSavedIndicator] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [isTextCollapsed, setIsTextCollapsed] = useState(true)
  const [sanctuaryMessage, setSanctuaryMessage] = useState("")
  const [copiedButton, setCopiedButton] = useState<string | null>(null)
  const [showMicroEncouragement, setShowMicroEncouragement] = useState(false)

  const saveTimerRef = useRef<NodeJS.Timeout>()
  const recognitionRef = useRef<any>(null)

  const charCount = text.length
  const isValid = charCount >= 100
  const minChars = 100

  useEffect(() => {
    const draft = getDraft()
    if (draft) {
      setSavedDraft(draft)
      setShowDraftBanner(true)
    }
  }, [])

  useEffect(() => {
    if (text.length > 0 && !hasAnalyzed) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }

      saveTimerRef.current = setTimeout(() => {
        saveDraft(text)
        setShowSavedIndicator(true)
        setTimeout(() => setShowSavedIndicator(false), 2000)
      }, 500)
    }

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [text, hasAnalyzed])

  useEffect(() => {
    if (charCount === 100 && !showMicroEncouragement) {
      const shown = typeof window !== "undefined" ? localStorage.getItem("asm_100_prompt_shown") : null

      if (!shown) {
        setShowMicroEncouragement(true)
        if (typeof window !== "undefined") {
          localStorage.setItem("asm_100_prompt_shown", Date.now().toString())
        }
        setTimeout(() => setShowMicroEncouragement(false), 3000)
      }
    }
  }, [charCount])

const handleAnalyze = async () => {
  if (!isValid) return

  setIsLoading(true)
  setSanctuaryMessage(getRandomSanctuaryMessage())
  setOriginalText(text)

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mode })
    })
    
    const data = await response.json()
    
    // Store results for results page
    sessionStorage.setItem('analysisResults', JSON.stringify(data))
    sessionStorage.setItem('analyzedText', text)
    
    // Route to results page
    window.location.href = '/results'
    
  } catch (error) {
    console.error('Analysis failed:', error)
    setIsLoading(false)
  }
}

  const handleCopy = async (content: string, buttonId: string) => {
    if (typeof window !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(content)
      setCopiedButton(buttonId)
      setTimeout(() => setCopiedButton(null), 2000)
    }
  }

  const handleSaveDraft = () => {
    saveDraft(text)
    setShowSavedIndicator(true)
    setTimeout(() => setShowSavedIndicator(false), 2000)
  }

  const handleRevertToDraft = () => {
    setText(originalText)
  }

  const handleRestoreDraft = () => {
    if (savedDraft) {
      setText(savedDraft)
      setShowDraftBanner(false)
    }
  }

  const handleDismissBanner = () => {
    setShowDraftBanner(false)
    clearDraft()
  }

  const handleVoiceInput = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Speech recognition is not supported in your browser")
      return
    }

    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true

    recognition.onstart = () => {
      setIsRecording(true)
    }

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join("")

      setText(transcript)
    }

    recognition.onerror = () => {
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const handleExampleClick = (example: string) => {
    const examples = {
      LinkedIn:
        "Passionate software engineer with 10+ years of experience building scalable web applications. I thrive on solving complex problems and mentoring junior developers. Always learning, always growing.",
      Dating:
        "I'm an adventurous soul who loves hiking on weekends and trying new coffee shops. I value deep conversations over small talk and believe in kindness above all else. Looking for someone who shares my curiosity about the world.",
      Email:
        "Hi team, I wanted to follow up on the project timeline we discussed last week. I think we should prioritize the user authentication feature first, as it blocks several other tasks. Let me know your thoughts!",
    }
    setText(examples[example as keyof typeof examples] || "")
  }

  const getPlaceholder = () => {
    switch (mode) {
      case "journal":
        return "Start by writing honestly, just for you.\nWhen ready, see how others might perceive your words.\nThen share - with one person, or many - at your pace.\nHealing happens when we're witnessed."
      case "someone":
        return "Write what you want to share with someone special. We'll help you understand how they might receive it."
      case "public":
        return "Craft your public message. We'll show you how your audience might perceive it."
      default:
        return "Start writing..."
    }
  }

  return (
    <>
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-violet-500 focus:text-white focus:rounded-lg"
      >
        Skip to main content
      </a>

      <main
        id="main-content"
        className="min-h-screen bg-zinc-950 text-white px-4 py-8 lg:py-12 pb-safe"
        aria-label="AISocialMirror landing page"
      >
        <AnimatePresence>
          {showDraftBanner && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-7xl mx-auto mb-4"
            >
              <Card className="bg-violet-500/10 border-violet-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-violet-200">Continue where you left off?</p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleRestoreDraft}
                      size="sm"
                      className="bg-violet-500 hover:bg-violet-600 text-white"
                    >
                      Restore
                    </Button>
                    <Button
                      onClick={handleDismissBanner}
                      size="sm"
                      variant="ghost"
                      className="text-violet-200 hover:text-white"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-7xl mx-auto"
        >
          {/* Mobile-first single column, desktop two-column */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-12 lg:items-start">
            {/* Left Column - Main Content */}
            <div className="space-y-8">
              {/* Hero Section */}
              <div className="text-center lg:text-left space-y-6">
                <motion.div
                  className="text-7xl lg:text-8xl animate-float animate-pulse-subtle inline-block"
                  aria-label="Mirror emoji"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{
                    duration: 0.5,
                    type: "spring",
                    stiffness: 200,
                  }}
                >
                  🪞
                </motion.div>

                <div className="space-y-3">
                  <h1 className="font-heading text-4xl lg:text-5xl xl:text-6xl font-bold text-balance leading-tight">
                    What does AI see when you write?
                  </h1>
                  <p className="text-lg lg:text-xl text-zinc-400 text-pretty">
                    Paste any text. Discover your <strong>perceived</strong> IQ, EQ, and SQ in seconds.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-green-500/10 border border-green-500/20 rounded-full px-4 py-2 flex items-center gap-2 min-h-[48px]"
                >
                  <Brain className="w-5 h-5 text-green-400" aria-hidden="true" />
                  <span className="text-sm font-medium text-green-400">IQ Score</span>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-blue-500/10 border border-red-500/20 rounded-full px-4 py-2 flex items-center gap-2 min-h-[48px]"
                >
                  <Heart className="w-5 h-5 text-red-400" aria-hidden="true" />
                  <span className="text-sm font-medium text-red-400">EQ Score</span>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-2 flex items-center gap-2 min-h-[48px]"
                >
                  <Sparkles className="w-5 h-5 text-amber-400" aria-hidden="true" />
                  <span className="text-sm font-medium text-amber-400">SQ Score</span>
                </motion.div>
              </div>

              {hasAnalyzed && (
                <Card className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setIsTextCollapsed(!isTextCollapsed)}
                    className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-sm text-zinc-400">Your text:</span>
                      <span className="text-sm text-zinc-200 truncate">
                        {isTextCollapsed ? `${text.slice(0, 50)}...` : "Tap to collapse"}
                      </span>
                    </div>
                    {isTextCollapsed ? (
                      <ChevronDown className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                    ) : (
                      <ChevronUp className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                    )}
                  </button>

                  <AnimatePresence>
                    {!isTextCollapsed && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-6 pt-0 space-y-4">
                          <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            className="w-full min-h-[160px] bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                          />
                          {text !== originalText && (
                            <Button onClick={handleAnalyze} className="w-full bg-violet-500 hover:bg-violet-600">
                              Re-analyze
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              )}

              {/* Input Card with Glass Effect */}
              {!hasAnalyzed && (
                <Card className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] rounded-2xl p-6 space-y-4">
                  <div className="space-y-2 relative">
                    <label htmlFor="text-input" className="sr-only">
                      Enter your text for analysis
                    </label>
                    <div className="relative">
                      <textarea
                        id="text-input"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={getPlaceholder()}
                        className="w-full min-h-[160px] lg:min-h-[200px] bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-3 pr-12 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                        aria-describedby="char-counter privacy-note"
                      />
                      <button
                        onClick={handleVoiceInput}
                        className={`absolute bottom-3 right-3 p-2 rounded-lg transition-colors ${
                          isRecording
                            ? "bg-red-500 text-white animate-pulse"
                            : "bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400"
                        }`}
                        aria-label={isRecording ? "Stop recording" : "Start voice input"}
                      >
                        <Mic className="w-5 h-5" />
                      </button>
                    </div>

                    <AnimatePresence>
                      {showMicroEncouragement && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute -top-8 left-0 text-sm text-violet-400"
                        >
                          Keep going...
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex items-center justify-between">
                    <div
                      id="char-counter"
                      className={`text-sm ${isValid ? "text-green-400" : "text-zinc-500"}`}
                      aria-live="polite"
                    >
                      {charCount} / {minChars} minimum
                    </div>

                    <AnimatePresence>
                      {showSavedIndicator && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="flex items-center gap-1 text-sm text-green-400"
                        >
                          <Check className="w-4 h-4" />
                          Saved
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {text.length > 0 && (
                    <div className="flex gap-2 pt-2 border-t border-white/[0.08]">
                      <button
                        onClick={() => handleCopy(text, "copy-text")}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/[0.05]"
                      >
                        {copiedButton === "copy-text" ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">Copy</span>
                      </button>
                      <button
                        onClick={handleSaveDraft}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/[0.05]"
                      >
                        <Save className="w-4 h-4" />
                        <span className="hidden sm:inline">Save Draft</span>
                      </button>
                    </div>
                  )}

                  {/* Privacy Note */}
                  <div id="privacy-note" className="flex items-center gap-2 text-sm text-zinc-400">
                    <span aria-hidden="true">🔒</span>
                    <span>Your text is analyzed but never stored</span>
                  </div>
                </Card>
              )}

              <Card className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] rounded-xl p-5">
                <div className="space-y-4">
                  <h3 className="font-semibold">What's this for?</h3>
                  <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2">
                    <button
                      onClick={() => setMode("journal")}
                      className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all min-h-[44px] ${
                        mode === "journal"
                          ? "bg-violet-500 text-white"
                          : "bg-white/[0.05] text-zinc-400 hover:bg-white/[0.08]"
                      }`}
                    >
                      📔 Journal
                    </button>
                    <button
                      onClick={() => setMode("someone")}
                      className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all min-h-[44px] ${
                        mode === "someone"
                          ? "bg-violet-500 text-white"
                          : "bg-white/[0.05] text-zinc-400 hover:bg-white/[0.08]"
                      }`}
                    >
                      💬 Share with Someone
                    </button>
                    <button
                      onClick={() => setMode("public")}
                      className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all min-h-[44px] ${
                        mode === "public"
                          ? "bg-violet-500 text-white"
                          : "bg-white/[0.05] text-zinc-400 hover:bg-white/[0.08]"
                      }`}
                    >
                      🌐 Share Publicly
                    </button>
                  </div>
                  <p className="text-sm text-zinc-400">
                    {mode === "journal" && "Write honestly, just for you. Reflect and understand yourself."}
                    {mode === "someone" && "Craft a message for someone special. See how they might receive it."}
                    {mode === "public" && "Prepare your public voice. Understand how your audience will perceive you."}
                  </p>
                </div>
              </Card>

              <div className="space-y-4">
                <h2 className="font-heading text-2xl lg:text-3xl font-bold text-center lg:text-left">
                  What Your Mirror Reveals
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    whileHover={{ scale: 1.02 }}
                  >
                    <Card className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] rounded-xl p-5 h-full space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                          <Brain className="w-6 h-6 text-green-400" aria-hidden="true" />
                        </div>
                        <h3 className="font-semibold text-lg">IQ Mirror</h3>
                      </div>
                      <p className="text-sm text-zinc-400 text-pretty">
                        Logical sharpness, clarity, and innovative thinking in your ideas
                      </p>
                    </Card>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    whileHover={{ scale: 1.02 }}
                  >
                    <Card className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] rounded-xl p-5 h-full space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-500/10 rounded-lg">
                          <Heart className="w-6 h-6 text-red-400" aria-hidden="true" />
                        </div>
                        <h3 className="font-semibold text-lg">EQ Mirror</h3>
                      </div>
                      <p className="text-sm text-zinc-400 text-pretty">
                        Empathy, emotional resonance, influence, and how you connect with others
                      </p>
                    </Card>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    whileHover={{ scale: 1.02 }}
                  >
                    <Card className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] rounded-xl p-5 h-full space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 rounded-lg">
                          <Sparkles className="w-6 h-6 text-amber-400" aria-hidden="true" />
                        </div>
                        <h3 className="font-semibold text-lg">SQ Mirror</h3>
                      </div>
                      <p className="text-sm text-zinc-400 text-pretty">
                        Spiritual depth, values alignment, purpose, and inspirational voice
                      </p>
                    </Card>
                  </motion.div>
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="font-heading text-2xl lg:text-3xl font-bold text-center lg:text-left">
                  See It In Action
                </h2>

                <div className="space-y-4">
                  {/* Example 1 - LinkedIn */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <Card className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] rounded-xl p-4 lg:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="flex-1 space-y-2">
                          <span className="text-xs font-medium text-violet-400 bg-violet-500/10 px-2 py-1 rounded inline-block">
                            LinkedIn Post
                          </span>
                          <p className="text-sm text-zinc-500 blur-[2px] select-none">
                            Excited to announce our team's latest product launch that will revolutionize...
                          </p>
                        </div>
                        <div className="text-xl sm:text-2xl text-zinc-600 self-center" aria-hidden="true">
                          →
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium text-green-400">Strength: High EQ</p>
                          <p className="text-sm text-zinc-400">
                            You build trust effortlessly. Blind spot: Slightly underplay your achievements.
                          </p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>

                  {/* Example 2 - Email/Text */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Card className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] rounded-xl p-4 lg:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="flex-1 space-y-2">
                          <span className="text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-1 rounded inline-block">
                            Email Thread
                          </span>
                          <p className="text-sm text-zinc-500 blur-[2px] select-none">
                            Following up on our discussion regarding the strategic initiative and next steps...
                          </p>
                        </div>
                        <div className="text-xl sm:text-2xl text-zinc-600 self-center" aria-hidden="true">
                          →
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium text-green-400">IQ shines in structured reasoning</p>
                          <p className="text-sm text-zinc-400">SQ opportunity: Add more visionary tone.</p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>

                  {/* Example 3 - Personal Reflection */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Card className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] rounded-xl p-4 lg:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="flex-1 space-y-2">
                          <span className="text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-1 rounded inline-block">
                            Personal Reflection
                          </span>
                          <p className="text-sm text-zinc-500 blur-[2px] select-none">
                            Looking back on this journey, I've learned that authenticity matters more than...
                          </p>
                        </div>
                        <div className="text-xl sm:text-2xl text-zinc-600 self-center" aria-hidden="true">
                          →
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium text-green-400">Natural storyteller with strong SQ</p>
                          <p className="text-sm text-zinc-400">Perfect for meaningful shares.</p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                </div>
              </div>

              {/* Primary CTA Button - Sticky on mobile */}
              <div className="sticky bottom-4 lg:static">
                <motion.div
                  whileTap={{ scale: isValid && !isLoading ? 0.98 : 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <Button
                    onClick={handleAnalyze}
                    disabled={!isValid || isLoading}
                    className="w-full h-14 min-h-[48px] bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white font-semibold text-lg rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/25 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                    aria-label={isLoading ? "Analyzing your text" : "Reveal my mirror"}
                  >
                    {isLoading ? (
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                          <span>Analyzing...</span>
                        </div>
                        <span className="text-xs text-violet-200 opacity-80">{sanctuaryMessage}</span>
                      </div>
                    ) : (
                      <>Reveal My Mirror →</>
                    )}
                  </Button>
                </motion.div>
              </div>

              {/* Social Proof Footer */}
              <div className="text-center lg:text-left">
                <p className="text-sm text-zinc-500">Join 12,847+ people who've discovered their reflection</p>
              </div>
            </div>

            {/* Right Column - Desktop Only */}
            <div className="hidden lg:block space-y-8 lg:sticky lg:top-12">
              {/* What You'll Discover Section */}
              <Card className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] rounded-2xl p-6 space-y-6">
                <h2 className="font-heading text-2xl font-bold">What You'll Discover</h2>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Brain className="w-6 h-6 text-green-400" aria-hidden="true" />
                      <h3 className="font-semibold text-lg">IQ - Intellectual Quotient</h3>
                    </div>
                    <p className="text-sm text-zinc-400 text-pretty">
                      How others perceive your cognitive abilities, reasoning, and problem-solving through your writing.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Heart className="w-6 h-6 text-red-400" aria-hidden="true" />
                      <h3 className="font-semibold text-lg">EQ - Emotional Quotient</h3>
                    </div>
                    <p className="text-sm text-zinc-400 text-pretty">
                      How your empathy, emotional awareness, and interpersonal communication are perceived by others.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-6 h-6 text-amber-400" aria-hidden="true" />
                      <h3 className="font-semibold text-lg">SQ - Spiritual Quotient</h3>
                    </div>
                    <p className="text-sm text-zinc-400 text-pretty">
                      How others sense your values, purpose, and inspirational depth in your communication.
                    </p>
                  </div>
                </div>
              </Card>

              {/* Example Use Cases */}
              <div className="space-y-4">
                <h3 className="font-heading text-lg font-semibold">Try an example:</h3>
                <div className="flex flex-wrap gap-3">
                  {["LinkedIn", "Dating", "Email"].map((example) => (
                    <motion.button
                      key={example}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleExampleClick(example)}
                      className="bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 min-h-[48px]"
                      aria-label={`Try ${example} example`}
                    >
                      {example}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* QR Code Component */}
              <QRCodeComponent />
            </div>
          </div>
        </motion.div>
      </main>
    </>
  )
}
