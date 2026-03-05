import sqlite3
import numpy as np
import json
import requests
import os
from dotenv import load_dotenv

OLLAMA_EMBED_URL = "http://localhost:11434/api/embeddings"
EMBED_MODEL = "nomic-embed-text"
TOP_K = 3

load_dotenv()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
SQLITE_DB_PATH = "C://Users//Sarang//OneDrive//Desktop//PBL//data//chat_history.db"

def cosine_similarity(a, b):
    try:
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
    except Exception:
        return 0

def embed_query(query):
    response = requests.post(
        OLLAMA_EMBED_URL,
        json={
            "model": EMBED_MODEL,
            "prompt": query
        },
        timeout=30
    )
    response.raise_for_status()
    return np.array(response.json()["embedding"])

def retrieve_top_chunks(query_vec, role_filter="student", author_filter=None):
    """
    Retrieves the top-K chunks from SQLite using cosine similarity.
    Filters by role/author (Teacher's core material + Student's personal notes).
    """
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cursor = conn.cursor()
    
    # Simple multi-tenancy filter
    # If Student: retrieve all 'teacher' roles + 'student' roles matching their author_filter
    if role_filter == "student":
        cursor.execute("SELECT text_chunk, embedding FROM knowledge_base WHERE role='teacher' OR (role='student' AND author=?)", (author_filter,))
    else:
        # If Teacher: retrieve just 'teacher' roles
        cursor.execute("SELECT text_chunk, embedding FROM knowledge_base WHERE role='teacher'")
        
    rows = cursor.fetchall()
    conn.close()
    
    scored_chunks = []
    for row in rows:
        text_chunk = row[0]
        db_vec = np.array(json.loads(row[1]))
        sim = cosine_similarity(query_vec, db_vec)
        scored_chunks.append((sim, text_chunk))
        
    # Sort descending
    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    return scored_chunks[:TOP_K]

def build_prompt(question, chunks, negative_constraints=""):
    sources_text = ""
    for i, chunk in enumerate(chunks, start=1):
        sources_text += f"[Source {i}]\n{chunk}\n\n"

    constraint_text = f"IMPORTANT RULE(S) FROM USER FEEDBACK: {negative_constraints}\n" if negative_constraints else ""

    prompt = f"""
You are an academic assistant.

{constraint_text}
Answer the question using ONLY the sources below.
If the answer cannot be found in the sources, say:
"I could not find this information in the provided material."

Sources:
{sources_text}

Question:
{question}
"""
    return prompt.strip()

def call_llm(prompt):
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "openai/gpt-3.5-turbo",
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2
        },
        timeout=60
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]
