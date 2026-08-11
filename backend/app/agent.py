import os
from typing import List, Dict, Any
from typing_extensions import TypedDict
from dotenv import load_dotenv

from langgraph.graph import START, StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

# Import our custom stock research tools
from app.tools import get_stock_price, get_stock_financials, web_search

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY is not set in environment variables")

# Initialize LLM with Gemini 2.5 flash-lite
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.0,
    google_api_key=api_key,
)

# Define tools list and map
tools = [get_stock_price, get_stock_financials, web_search]
tools_map = {tool.name: tool for tool in tools}

# Bind tools to the LLM for ReAct loop
llm_with_tools = llm.bind_tools(tools)

# Define LangGraph Agent State
class State(TypedDict):
    question: str
    answer: str
    summary: str
    recent_messages: List[Dict[str, str]]
    # Local message stack for the current graph execution turn
    messages: List[Any]

# Graph Nodes

def init_messages(state: State) -> Dict[str, Any]:
    """Prepares the message list by adding system prompt, recent history, and current question."""
    summary_context = state.get("summary", "")
    recent = state.get("recent_messages", []) or []
    question = state.get("question", "")
    
    # System instructions detailing capabilities and data rendering style
    system_instruction = (
        "You are an expert Stock Research Assistant. You help users analyze stock prices, key financial metrics, "
        "business models, and latest market news.\n\n"
        "Always write clean, structured answers. If analyzing stocks, present figures (like P/E, Market Cap, Revenue) "
        "in clean markdown tables so the user can easily digest it.\n"
        "If you need to fetch price information, use 'get_stock_price'.\n"
        "If you need financials, use 'get_stock_financials'.\n"
        "If you need latest news or events, use 'web_search'.\n\n"
        "CRITICAL RULE: Always call tools first to get accurate up-to-date facts before rendering your analysis. "
        "If 'get_stock_price' or 'get_stock_financials' returns a rate limit error, lack of data, or any other failure, "
        "you MUST immediately call the 'web_search' tool with a specific search query (e.g., 'current stock price of <symbol>' "
        "or '<symbol> net income market cap PE ratio revenue') to find the required stats in the web search results. "
        "Do NOT say 'I cannot access real-time information' or 'I don't have access' until you have exhausted the 'web_search' fallback.\n\n"
        f"Summary of conversation so far:\n{summary_context if summary_context else 'No previous conversation history.'}"
    )

    
    messages = [SystemMessage(content=system_instruction)]
    
    # Load recent conversation turns
    for msg in recent:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
            
    # Append the new user question
    messages.append(HumanMessage(content=question))
    
    return {"messages": messages}

def agent_node(state: State) -> Dict[str, Any]:
    """Invokes the Gemini model with available tools bound."""
    response = llm_with_tools.invoke(state["messages"])
    return {"messages": state["messages"] + [response]}

def action_node(state: State) -> Dict[str, Any]:
    """Executes requested tool calls and returns ToolMessages."""
    last_message = state["messages"][-1]
    new_messages = []
    
    for tool_call in last_message.tool_calls:
        tool_name = tool_call["name"]
        tool_args = tool_call["args"]
        tool_call_id = tool_call["id"]
        
        # Execute tool
        if tool_name in tools_map:
            tool = tools_map[tool_name]
            try:
                tool_output = tool.invoke(tool_args)
            except Exception as e:
                tool_output = f"Error executing tool {tool_name}: {str(e)}"
        else:
            tool_output = f"Error: Tool '{tool_name}' is not registered."
            
        new_messages.append(
            ToolMessage(
                content=str(tool_output),
                name=tool_name,
                tool_call_id=tool_call_id
            )
        )
        
    return {"messages": state["messages"] + new_messages}

def summarize_node(state: State) -> Dict[str, Any]:
    """Updates the conversation summary and trims the message log for space-saving storage."""
    last_message = state["messages"][-1]
    answer = last_message.content
    
    # Generate updated summary
    current_summary = state.get("summary", "")
    question = state.get("question", "")
    
    summary_prompt = (
        "You are an assistant that maintains a running summary of a stock research conversation.\n"
        "Integrate the new exchange into the existing summary below. Keep the output extremely concise (under 200 words), "
        "highlighting stock tickers discussed and the core analysis. Do not include intro or outro text—only the summary.\n\n"
        f"Current Summary:\n{current_summary if current_summary else 'None'}\n\n"
        f"New Exchange:\nUser: {question}\nAssistant: {answer}"
    )
    
    try:
        summary_response = llm.invoke(summary_prompt)
        updated_summary = summary_response.content.strip()
    except Exception as e:
        print(f"Error generating summary: {e}")
        updated_summary = current_summary  # Fallback to old summary
        
    # Maintain sliding window of the last 4 messages (2 turns)
    recent = state.get("recent_messages", []) or []
    recent.append({"role": "user", "content": question})
    recent.append({"role": "assistant", "content": answer})
    recent = recent[-4:]
    
    return {
        "answer": answer,
        "summary": updated_summary,
        "recent_messages": recent
    }

# Conditional routing edge
def should_continue(state: State) -> str:
    """Routes to action node if tool calls are requested, otherwise to summarize."""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "action"
    return "summarize"

# Build LangGraph Workflow
graph_builder = StateGraph(State)

# Add nodes
graph_builder.add_node("init_messages", init_messages)
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("action", action_node)
graph_builder.add_node("summarize", summarize_node)

# Set edges
graph_builder.add_edge(START, "init_messages")
graph_builder.add_edge("init_messages", "agent")

# Add conditional path
graph_builder.add_conditional_edges(
    "agent",
    should_continue,
    {
        "action": "action",
        "summarize": "summarize"
    }
)

# Loop back to agent after action executes
graph_builder.add_edge("action", "agent")
graph_builder.add_edge("summarize", END)

# Compile the final graph
graph = graph_builder.compile()
