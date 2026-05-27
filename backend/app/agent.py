from typing_extensions import TypedDict
from typing import List

from langgraph.graph import START, StateGraph

from langchain_google_genai import ChatGoogleGenerativeAI

import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.0
)

class State(TypedDict):
    question: str
    answer: str
    history: List[str]

def classify(state: State):

    return {"question": state["question"]}

def generate(state: State):

    context = "\n".join(state.get("history", []))

    prompt = f"""
    You are a conversational AI Assistant.
    Use the context history naturally.

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

graph_builder = StateGraph(State).add_sequence([
    classify,
    generate,
    refine
])

graph_builder.add_edge(START, "classify")

graph = graph_builder.compile()