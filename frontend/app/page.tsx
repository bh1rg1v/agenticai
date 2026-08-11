"use client"

import React, { useState, useEffect, useCallback } from "react"
import axios from "axios"
import ReactMarkdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"

type Message = {
  role: "user" | "assistant"
  content: string
}

type ChatSession = {
  id: string
  title: string
  summary: string
  updated_at?: string
}

// Dynamically handle local testing vs production URL
const getApiBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL
  }
  if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return "http://localhost:8000"
  }
  return "https://agenticai-iarw.onrender.com"
}

const API_BASE_URL = getApiBaseUrl()

// Local storage session key helper for guest sessions
const GUEST_SESSION_KEY = "agenticai_guest_session_id"
const AUTH_TOKEN_KEY = "agenticai_auth_token"
const USERNAME_KEY = "agenticai_username"

const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

export default function Home() {
  // Authentication & session states
  const [token, setToken] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [chats, setChats] = useState<ChatSession[]>([])
  const [currentChatId, setCurrentChatId] = useState<string>("")
  const [currentSummary, setCurrentSummary] = useState<string>("")
  const [summaryBannerOpen, setSummaryBannerOpen] = useState(true)

  // Chat window states
  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  // Auth Dialog state
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<"login" | "register">("login")
  const [authUsername, setAuthUsername] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authError, setAuthError] = useState("")

  // Helper to attach authorization header
  const getHeaders = useCallback((authToken = token) => {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {}
  }, [token])

  // --- API CALLS ---

  const fetchUserChats = useCallback(async (authToken: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      setChats(response.data)
      
      // Auto-load most recent chat if any
      if (response.data.length > 0) {
        // We call loadChat inline to avoid dependency issues
        const chatId = response.data[0].id
        setLoading(true)
        try {
          const detailResponse = await axios.get(`${API_BASE_URL}/api/chats/${chatId}`, {
            headers: { Authorization: `Bearer ${authToken}` }
          })
          const chat = detailResponse.data
          setCurrentChatId(chat.id)
          setCurrentSummary(chat.summary || "")
          
          const loadedMessages: Message[] = []
          if (chat.recent_messages && Array.isArray(chat.recent_messages)) {
            chat.recent_messages.forEach((m: { role: "user" | "assistant"; content: string }) => {
              loadedMessages.push({
                role: m.role,
                content: m.content
              })
            })
          }
          setMessages(loadedMessages)
        } catch (err) {
          console.error("Error loading chat:", err)
        } finally {
          setLoading(false)
        }
      } else {
        const newId = generateId()
        setCurrentChatId(newId)
        setMessages([])
        setCurrentSummary("")
      }
    } catch (err: unknown) {
      console.error("Error fetching chats:", err)
      const error = err as { response?: { status: number } }
      if (error.response?.status === 401) {
        // Log out immediately
        localStorage.removeItem(AUTH_TOKEN_KEY)
        localStorage.removeItem(USERNAME_KEY)
        setToken(null)
        setUsername(null)
        setChats([])
        setMessages([])
        setCurrentSummary("")
        const guestSessionId = `guest_${generateId()}`
        localStorage.setItem(GUEST_SESSION_KEY, guestSessionId)
        setCurrentChatId(guestSessionId)
      }
    }
  }, [])

  const loadChat = async (chatId: string, authToken = token) => {
    if (!authToken) return
    setLoading(true)
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chats/${chatId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      const chat = response.data
      setCurrentChatId(chat.id)
      setCurrentSummary(chat.summary || "")
      
      const loadedMessages: Message[] = []
      if (chat.recent_messages && Array.isArray(chat.recent_messages)) {
        chat.recent_messages.forEach((m: { role: "user" | "assistant"; content: string }) => {
          loadedMessages.push({
            role: m.role,
            content: m.content
          })
        })
      }
      setMessages(loadedMessages)
    } catch (err) {
      console.error("Error loading chat:", err)
    } finally {
      setLoading(false)
    }
  }

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!token) return
    if (!confirm("Are you sure you want to delete this chat?")) return

    try {
      await axios.delete(`${API_BASE_URL}/api/chats/${chatId}`, {
        headers: getHeaders()
      })
      setChats(prev => prev.filter(c => c.id !== chatId))
      if (currentChatId === chatId) {
        const remaining = chats.filter(c => c.id !== chatId)
        if (remaining.length > 0) {
          loadChat(remaining[0].id)
        } else {
          // Start a new chat
          const newId = generateId()
          setCurrentChatId(newId)
          setMessages([])
          setCurrentSummary("")
        }
      }
    } catch (err) {
      console.error("Error deleting chat:", err)
    }
  }

  const startNewChat = () => {
    if (token) {
      const newId = generateId()
      setCurrentChatId(newId)
      setMessages([])
      setCurrentSummary("")
    } else {
      const newGuestId = `guest_${generateId()}`
      localStorage.setItem(GUEST_SESSION_KEY, newGuestId)
      setCurrentChatId(newGuestId)
      setMessages([])
      setCurrentSummary("")
    }
  }

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError("")
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError("All fields are required")
      return
    }

    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register"
    try {
      const response = await axios.post(`${API_BASE_URL}${endpoint}`, {
        username: authUsername,
        password: authPassword
      })

      const { access_token, username: resUsername } = response.data
      localStorage.setItem(AUTH_TOKEN_KEY, access_token)
      localStorage.setItem(USERNAME_KEY, resUsername)
      setToken(access_token)
      setUsername(resUsername)
      setAuthModalOpen(false)
      
      setAuthUsername("")
      setAuthPassword("")
      
      fetchUserChats(access_token)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } }
      setAuthError(error.response?.data?.detail || "Authentication failed")
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(USERNAME_KEY)
    setToken(null)
    setUsername(null)
    setChats([])
    setMessages([])
    setCurrentSummary("")
    
    const guestSessionId = `guest_${generateId()}`
    localStorage.setItem(GUEST_SESSION_KEY, guestSessionId)
    setCurrentChatId(guestSessionId)
  }

  const sendMessage = async (presetText?: string) => {
    const textToSend = presetText || message
    if (!textToSend.trim() || loading) return

    setMessages(prev => [...prev, { role: "user", content: textToSend }])
    if (!presetText) setMessage("")
    setLoading(true)

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/chat`,
        {
          session_id: currentChatId,
          message: textToSend
        },
        { headers: getHeaders() }
      )

      const { answer, summary } = response.data
      
      setMessages(prev => [...prev, { role: "assistant", content: answer }])
      setCurrentSummary(summary || "")
      
      if (token) {
        const listResponse = await axios.get(`${API_BASE_URL}/api/chats`, { headers: getHeaders() })
        setChats(listResponse.data)
      }
    } catch (err: unknown) {
      console.error(err)
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Error connecting to stock backend. Make sure the backend environment variables (GEMINI_API_KEY, TAVILY_API_KEY) are loaded." }
      ])
    } finally {
      setLoading(false)
    }
  }

  // Set up persistent guest session or fetch user sessions on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(AUTH_TOKEN_KEY)
    const savedUsername = localStorage.getItem(USERNAME_KEY)

    // Wrap in a setTimeout to decouple state triggers from useEffect mount thread
    const timer = setTimeout(() => {
      if (savedToken && savedUsername) {
        setToken(savedToken)
        setUsername(savedUsername)
        fetchUserChats(savedToken)
      } else {
        let guestSessionId = localStorage.getItem(GUEST_SESSION_KEY)
        if (!guestSessionId) {
          guestSessionId = `guest_${generateId()}`
          localStorage.setItem(GUEST_SESSION_KEY, guestSessionId)
        }
        setCurrentChatId(guestSessionId)
      }
    }, 0)

    return () => clearTimeout(timer)
  }, [fetchUserChats])

  return (
    <main className="h-screen bg-[#07080d] text-slate-100 flex overflow-hidden font-sans">
      
      {/* Sidebar for Registered Users */}
      <div className="w-80 border-r border-slate-800/80 bg-[#0b0d19]/80 flex flex-col shrink-0">
        
        {/* Logo & App Title */}
        <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-slate-900">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-white">EquiMind AI</h1>
            <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Stock Research Agent</p>
          </div>
        </div>

        {/* User Profile Section */}
        <div className="p-4 border-b border-slate-800/60 bg-slate-900/20">
          {token && username ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-emerald-400 border border-slate-700">
                  {username[0].toUpperCase()}
                </div>
                <div className="max-w-[120px] overflow-hidden">
                  <p className="text-sm font-semibold text-slate-200 truncate">{username}</p>
                  <p className="text-[10px] text-emerald-400">Registered DB Profile</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                title="Log Out"
                className="p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-400 hover:text-rose-400 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400 border border-slate-800">
                  G
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-300">Guest User</p>
                  <p className="text-[10px] text-slate-500">In-Memory (No DB)</p>
                </div>
              </div>
              <button
                onClick={() => { setAuthMode("login"); setAuthModalOpen(true); }}
                className="w-full py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-xs tracking-wide transition shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20"
              >
                Sync with Neon DB
              </button>
            </div>
          )}
        </div>

        {/* Chats History List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Research Sessions</span>
            {token && (
              <button 
                onClick={() => startNewChat()}
                className="p-1 rounded hover:bg-slate-800 text-emerald-400 transition"
                title="Create New Research Session"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            )}
          </div>
          
          {token ? (
            chats.length > 0 ? (
              chats.map((c) => (
                <div
                  key={c.id}
                  onClick={() => loadChat(c.id)}
                  className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition text-sm ${
                    currentChatId === c.id 
                      ? "bg-slate-800/60 border-l-2 border-emerald-500 text-white" 
                      : "hover:bg-slate-900/50 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-slate-500 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                    </svg>
                    <span className="truncate">{c.title || "Untitled Analysis"}</span>
                  </div>
                  <button
                    onClick={(e) => deleteChat(c.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-rose-400 transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              ))
            ) : (
              <div className="p-3 text-xs text-slate-600 text-center italic">No saved database chats</div>
            )
          ) : (
            <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800/50 text-center space-y-2">
              <p className="text-xs text-slate-500">Sign in to save research history and optimize stock analysis contexts.</p>
            </div>
          )}
        </div>

      </div>

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col relative h-full bg-[#07080d] overflow-hidden">
        
        {/* Header */}
        <div className="h-16 border-b border-slate-800/80 px-6 flex items-center justify-between bg-[#0b0d19]/40 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-sm font-semibold tracking-wide text-slate-200">
              {token ? "Neon Database Active Session" : "Guest Sandbox Mode"}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {currentSummary && (
              <button 
                onClick={() => setSummaryBannerOpen(!summaryBannerOpen)}
                className={`py-1.5 px-3 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
                  summaryBannerOpen 
                    ? "bg-slate-800/80 border-slate-700 text-emerald-400" 
                    : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" />
                </svg>
                Chat Summary {summaryBannerOpen ? "Shown" : "Hidden"}
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Running Summary Banner */}
        {currentSummary && summaryBannerOpen && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 shadow-md shadow-emerald-950/10 flex items-start gap-3 animate-fade-in shrink-0">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-1">Conversational Running Context (DB Space Optimized)</h4>
              <p className="text-sm text-slate-300 leading-relaxed italic">&quot;{currentSummary}&quot;</p>
            </div>
          </div>
        )}

        {/* Messages List Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length > 0 ? (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                } animate-fade-in`}
              >
                <div
                  className={`max-w-[78%] px-5 py-4 rounded-2xl text-sm leading-relaxed shadow-lg border ${
                    msg.role === "user"
                      ? "bg-emerald-600/90 border-emerald-500/60 text-slate-50"
                      : "bg-[#0b0d19]/80 border-slate-800 text-slate-100"
                  }`}
                >
                  <div className="prose prose-invert max-w-none">
                    <ReactMarkdown
                      components={{
                        // Table styling (highly tailored for yfinance financial outputs)
                        table({ children }) {
                          return (
                            <div className="overflow-x-auto my-4 rounded-lg border border-slate-700/60 shadow-md">
                              <table className="min-w-full divide-y divide-slate-700/80 bg-slate-900/30">
                                {children}
                              </table>
                            </div>
                          )
                        },
                        thead({ children }) {
                          return <thead className="bg-slate-800/50">{children}</thead>
                        },
                        tbody({ children }) {
                          return <tbody className="divide-y divide-slate-800/80">{children}</tbody>
                        },
                        tr({ children }) {
                          return <tr className="hover:bg-slate-800/20 transition">{children}</tr>
                        },
                        th({ children }) {
                          return <th className="px-4 py-2 text-left text-xs font-bold text-slate-200 uppercase tracking-wider">{children}</th>
                        },
                        td({ children }) {
                          return <td className="px-4 py-2 text-sm text-slate-300">{children}</td>
                        },
                        pre({ children }) {
                          return <div className="relative group my-4">{children}</div>
                        },
                        code({ children, className }) {
                          const codeText = String(children).replace(/\n$/, "")
                          const match = /language-(\w+)/.exec(className || "")
                          const language = match?.[1] || "python"
                          const isBlock = className?.includes("language-") || codeText.includes("\n")

                          if (isBlock) {
                            return (
                              <div className="relative group">
                                <button
                                  onClick={() => navigator.clipboard.writeText(codeText)}
                                  className="absolute top-3 right-3 z-10 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition duration-150"
                                >
                                  Copy
                                </button>
                                <SyntaxHighlighter
                                  language={language}
                                  style={oneDark}
                                  wrapLongLines={true}
                                  customStyle={{
                                    margin: 0,
                                    padding: "20px",
                                    borderRadius: "12px",
                                    background: "#030408",
                                    border: "1px solid rgba(255, 255, 255, 0.08)",
                                    fontSize: "13px",
                                    lineHeight: "1.7",
                                  }}
                                >
                                  {codeText}
                                </SyntaxHighlighter>
                              </div>
                            )
                          }

                          return (
                            <code className="bg-slate-800/60 border border-slate-700/60 px-1.5 py-0.5 rounded text-emerald-400 font-mono font-semibold">
                              {children}
                            </code>
                          )
                        },
                        p({ children }) {
                          return <p className="mb-3 leading-7 text-slate-300">{children}</p>
                        },
                        ul({ children }) {
                          return <ul className="list-disc ml-6 mb-3 space-y-2 text-slate-300">{children}</ul>
                        },
                        ol({ children }) {
                          return <ol className="list-decimal ml-6 mb-3 space-y-2 text-slate-300">{children}</ol>
                        },
                        h1({ children }) {
                          return <h1 className="text-2xl font-bold text-white mb-4 mt-2">{children}</h1>
                        },
                        h2({ children }) {
                          return <h2 className="text-xl font-semibold text-white mb-3 mt-2">{children}</h2>
                        },
                        h3({ children }) {
                          return <h3 className="text-lg font-semibold text-emerald-400 mb-2 mt-2">{children}</h3>
                        }
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))
          ) : (
            // Centered Suggestion Prompt Template cards
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto space-y-8 text-center">
              <div className="space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/20 glow-active">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7 text-emerald-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468l-4.978-.996a1.5 1.5 0 0 1-1.185-1.185l-.996-4.977a3.75 3.75 0 0 0-7.47.495L1.83 18.75a9 9 0 0 0 10.17 10.17l5.378-1.344a3.75 3.75 0 0 0-.495-7.47l-4.978-.996Z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight">EquiMind Stock Workspace</h2>
                <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                  Enter a stock ticker or search query. I will execute custom tools to query yahoo finance metrics and fetch web reports.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 w-full">
                {[
                  {
                    title: "Analyze Apple Financials",
                    desc: "Pull key ratios, market cap, and revenue for AAPL.",
                    prompt: "Provide a complete financial overview for stock ticker AAPL"
                  },
                  {
                    title: "Tesla Price & Trend",
                    desc: "Get current stock price, daily range, and 52-week highs.",
                    prompt: "Fetch the current stock price details for TSLA"
                  },
                  {
                    title: "NVIDIA Web Sentiment",
                    desc: "Search the web for news, analyst sentiment, and product launches.",
                    prompt: "Search the web for recent announcements and sentiment on NVIDIA NVDA stock"
                  },
                  {
                    title: "Compare Chip Stocks",
                    desc: "Examine and contrast details on AMD and Intel.",
                    prompt: "Search the web and compare the financials and current prices of AMD and INTC"
                  }
                ].map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(s.prompt)}
                    className="p-4 rounded-xl bg-[#0b0d19]/60 hover:bg-[#111426]/80 border border-slate-800 hover:border-emerald-500/30 text-left transition duration-200 group flex flex-col justify-between"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200 group-hover:text-emerald-400 transition">{s.title}</h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.desc}</p>
                    </div>
                    <span className="text-[10px] text-emerald-400/80 font-mono mt-3 self-end flex items-center gap-1 group-hover:translate-x-1 transition-all">
                      Analyze →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#0b0d19]/80 border border-slate-800 px-5 py-3.5 rounded-2xl text-sm text-emerald-400 flex items-center gap-3 shadow-lg">
                <svg className="animate-spin h-4 w-4 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>EquiMind is running research tools...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 bg-[#07080d] border-t border-slate-800 shrink-0">
          <div className="max-w-4xl mx-auto flex gap-3">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendMessage()
                }
              }}
              placeholder="Enter ticker (e.g. MSFT) or query stock details..."
              className="flex-1 bg-[#0b0d19]/60 border border-slate-800 rounded-xl px-4 py-3.5 outline-none text-slate-100 placeholder-slate-500 focus:border-emerald-500/80 transition duration-200"
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-6 py-3.5 rounded-xl transition shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
            >
              <span>Research</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>

      </div>

      {/* Login & Register Modal Dialog */}
      {authModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#0b0d19] border border-slate-800 p-6 space-y-6 shadow-2xl relative animate-scale-up">
            
            <button 
              onClick={() => setAuthModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">
                {authMode === "login" ? "Log In to Neon Profile" : "Register Database Account"}
              </h3>
              <p className="text-xs text-slate-400">
                {authMode === "login" ? "Access your saved chat history and summaries." : "Create an optimized account for stock analysis."}
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Username</label>
                <input
                  type="text"
                  required
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full bg-[#111426] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/80 transition"
                  placeholder="Enter username"
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Password</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-[#111426] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/80 transition"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold text-sm tracking-wide transition shadow-lg shadow-emerald-500/10"
              >
                {authMode === "login" ? "Sign In" : "Sign Up"}
              </button>
            </form>

            <div className="text-center">
              <button
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login")
                  setAuthError("")
                }}
                className="text-xs text-emerald-400 hover:underline font-medium"
              >
                {authMode === "login" ? "Need an account? Sign Up" : "Already have an account? Sign In"}
              </button>
            </div>

          </div>
        </div>
      )}

    </main>
  )
}