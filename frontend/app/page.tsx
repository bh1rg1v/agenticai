"use client"

import { useState } from "react"
import axios from "axios"
import ReactMarkdown from "react-markdown"

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"

import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"

type Message = {
  role: "user" | "assistant"
  content: string
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://agenticai-iarw.onrender.com"

export default function Home() {

  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  const sendMessage = async () => {

    if (!message.trim()) return

    const userMessage = message

    setMessages(prev => [
      ...prev,
      {
        role: "user",
        content: userMessage
      }
    ])

    setMessage("")
    setLoading(true)

    try {

      const response = await axios.post(
        `${API_BASE_URL}/chat`,
        {
          session_id: "user-1",
          message: userMessage
        }
      )

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: response.data.answer
        }
      ])

    } catch {

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "Error connecting to backend."
        }
      ])

    }

    setLoading(false)
  }

  return (

    <main className="flex h-screen bg-[#0f0f0f] text-white">

      {/* Sidebar */}

      <div className="w-[260px] border-r border-zinc-800 p-5 hidden md:flex flex-col">

        <h1 className="text-2xl font-bold mb-6">
          AI Agent
        </h1>

        <button
          className="
            bg-zinc-800
            hover:bg-zinc-700
            transition
            p-3
            rounded-xl
            border
            border-zinc-700
          "
        >
          + New Chat
        </button>

      </div>

      {/* Main Chat Area */}

      <div className="flex-1 flex flex-col">

        {/* Header */}

        <div className="border-b border-zinc-800 p-5 text-xl font-semibold backdrop-blur-sm">
          Conversational AI Assistant
        </div>

        {/* Messages */}

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {
            messages.map((msg, idx) => (

              <div
                key={idx}
                className={`flex ${
                  msg.role === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >

                <div
                  className={`

                    max-w-[75%]
                    px-5
                    py-4
                    rounded-2xl
                    text-sm
                    leading-relaxed
                    shadow-lg
                    border
                    overflow-x-auto

                    ${
                      msg.role === "user"
                        ? "bg-blue-600 border-blue-500"
                        : "bg-zinc-900 border-zinc-700"
                    }

                  `}
                >

                  <div
                    className="
                      prose
                      prose-invert
                      max-w-none

                      prose-pre:bg-transparent
                      prose-pre:p-0
                      prose-pre:m-0
                      prose-pre:border-0

                      prose-code:bg-transparent
                      prose-code:p-0
                      prose-code:text-inherit

                      prose-code:before:content-none
                      prose-code:after:content-none
                    "
                  >

                    <ReactMarkdown
                      components={{

                        pre({ children }) {

                          return (
                            <div className="relative group my-4">
                              {children}
                            </div>
                          )
                        },

                        code(props) {

                          const { children, className } = props

                          const codeText = String(children).replace(/\n$/, "")

                          const match = /language-(\w+)/.exec(className || "")

                          const language = match?.[1] || "python"

                          const isBlock =
                            className?.includes("language-") ||
                            codeText.includes("\n")

                          if (isBlock) {

                            return (

                              <div className="relative group">

                                {/* Copy Button */}

                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(codeText)
                                  }}
                                  className="
                                    absolute
                                    top-3
                                    right-3
                                    z-10
                                    text-xs
                                    bg-zinc-700
                                    hover:bg-zinc-600
                                    px-3
                                    py-1
                                    rounded-lg
                                    opacity-0
                                    group-hover:opacity-100
                                    transition
                                  "
                                >
                                  Copy
                                </button>

                                {/* Syntax Highlighted Code */}

                                <SyntaxHighlighter
                                  language={language}
                                  style={oneDark}
                                  wrapLongLines={true}
                                  customStyle={{
                                    margin: 0,
                                    padding: "20px",
                                    borderRadius: "16px",
                                    background: "#000000",
                                    border: "1px solid rgb(63 63 70)",
                                    fontSize: "14px",
                                    lineHeight: "1.8",
                                  }}
                                  codeTagProps={{
                                    style: {
                                      background: "transparent",
                                      whiteSpace: "pre",
                                    }
                                  }}
                                >
                                  {codeText}
                                </SyntaxHighlighter>

                              </div>

                            )
                          }

                          return (

                            <code
                              className="
                                bg-black/40
                                border
                                border-zinc-700
                                px-1.5
                                py-0.5
                                rounded
                                text-blue-300
                              "
                            >
                              {children}
                            </code>

                          )
                        },

                        p({ children }) {

                          return (
                            <p className="mb-3 leading-7">
                              {children}
                            </p>
                          )
                        },

                        ul({ children }) {

                          return (
                            <ul className="list-disc ml-6 mb-3 space-y-2">
                              {children}
                            </ul>
                          )
                        },

                        ol({ children }) {

                          return (
                            <ol className="list-decimal ml-6 mb-3 space-y-2">
                              {children}
                            </ol>
                          )
                        },

                        h1({ children }) {

                          return (
                            <h1 className="text-3xl font-bold mb-4">
                              {children}
                            </h1>
                          )
                        },

                        h2({ children }) {

                          return (
                            <h2 className="text-2xl font-semibold mb-3">
                              {children}
                            </h2>
                          )
                        },

                        h3({ children }) {

                          return (
                            <h3 className="text-xl font-semibold mb-2">
                              {children}
                            </h3>
                          )
                        }
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>

                  </div>

                </div>

              </div>

            ))
          }

          {
            loading && (

              <div className="flex justify-start">

                <div
                  className="
                    bg-zinc-900
                    border
                    border-zinc-700
                    px-5
                    py-3
                    rounded-2xl
                    text-sm
                    animate-pulse
                  "
                >
                  AI is thinking...
                </div>

              </div>

            )
          }

        </div>

        {/* Input Area */}

        <div className="border-t border-zinc-800 p-5 backdrop-blur-sm">

          <div className="flex gap-3">

            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendMessage()
                }
              }}
              placeholder="Ask anything..."
              className="
                flex-1
                bg-zinc-900
                border
                border-zinc-700
                rounded-xl
                px-4
                py-3
                outline-none
                focus:border-blue-500
                transition
              "
            />

            <button
              onClick={sendMessage}
              className="
                bg-blue-600
                hover:bg-blue-500
                transition
                px-6
                rounded-xl
                font-medium
              "
            >
              Send
            </button>

          </div>

        </div>

      </div>

    </main>
  )
}
