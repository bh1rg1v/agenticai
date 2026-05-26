from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel

from app.agent import graph

app = FastAPI()

# Allow Next.js frontend

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session storage

sessions = {}

# Request Model

class ChatRequest(BaseModel):
    session_id: str
    question: str

# Response Model

class ChatResponse(BaseModel):
    answer: str

@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):

    if req.session_id not in sessions:
        sessions[req.session_id] = {
            "question": "",
            "answer": "",
            "history": [],
        }

    state = sessions[req.session_id]

    state["question"] = req.question

    response = graph.invoke(state)

    state.update(response)

    return {
        "answer": response["answer"]
    }