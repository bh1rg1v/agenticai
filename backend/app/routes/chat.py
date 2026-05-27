from fastapi import APIRouter

from pydantic import BaseModel

from app.agent import graph

router = APIRouter()

memory = {}

class ChatRequest(BaseModel):
    session_id: str
    message: str

@router.post("/chat")

def chat(request: ChatRequest):

    session_id = request.session_id

    if session_id not in memory:

        memory[session_id] = {
            "question": "",
            "answer": "",
            "history": []
        }

    state = memory[session_id]

    state["question"] = request.message

    response = graph.invoke(state)

    memory[session_id].update(response)

    return {
        "answer": response["answer"]
    }