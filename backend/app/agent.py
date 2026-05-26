import os
from dotenv import load_dotenv

from typing_extensions import TypedDict
from typing import List

from langgraph.graph import START, StateGraph
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.0
)

# Agent State

class State(TypedDict):
    question: str
    answer: str
    history: List[str]

# Nodes

def classify(state: State):

    return {
        "question": state["question"]
    }

def generate(state: State):

    context = "\n".join(state.get("history", []))

    prompt = f"""
    You are a conversational AI Assistant.

    Use the conversation history naturally.

    Keep answers concise.

    Context:
    {context}

    Question:
    {state["question"]}
    """

    response = llm.invoke(prompt)

    return {
        "answer": response.content
    }

def refine(state: State):

    refined = state["answer"]

    history = state.get("history", [])

    history.append(
        f"Q: {state['question']}\nA: {refined}"
    )

    return {
        "answer": refined,
        "history": history
    }

# Build Graph

graph_builder = StateGraph(State)

graph_builder.add_node("classify", classify)
graph_builder.add_node("generate", generate)
graph_builder.add_node("refine", refine)

graph_builder.add_edge(START, "classify")
graph_builder.add_edge("classify", "generate")
graph_builder.add_edge("generate", "refine")

graph = graph_builder.compile()