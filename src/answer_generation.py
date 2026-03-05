import sqlite3
import numpy as np
import json
import requests
import os
from dotenv import load_dotenv

OLLAMA_EMBED_URL = "http://localhost:11434/api/embeddings"
EMBED_MODEL = "nomic-embed-text"
SIMILARITY_THRESHOLD = 0.65  # Retrieval cutoff
TOP_K = 5 # Fallback max chunks

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
    
    # Threshold-based filtering
    filtered_chunks = [c for c in scored_chunks if c[0] >= SIMILARITY_THRESHOLD]
    
    # Return at least TOP_K if threshold is too strict, but filtered is preferred
    return filtered_chunks if filtered_chunks else scored_chunks[:TOP_K]

def refine_chunks_with_feedback(message_id, suggestion):
    """
    Self-Correcting Loop: Takes a professor's suggestion and the chunks that led to the answer,
    generates refined chunks, and updates the knowledge base.
    """
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cursor = conn.cursor()
    
    # 1. Get the original chunks used (This requires tracking which chunks were used)
    # For now, we'll re-retrieve based on the user's last question in this session
    cursor.execute("SELECT content FROM messages WHERE id = (SELECT MAX(id) FROM messages WHERE id < ? AND role='user')", (message_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    
    question = row[0]
    query_vec = embed_query(question)
    top_chunks = retrieve_top_chunks(query_vec)
    
    refined_results = []
    for sim, text in top_chunks:
        prompt = f"""
You are an expert academic editor. A professor has provided a suggestion to improve the accuracy of a research assistant.
Original Chunk:
{text}

Professor's Suggestion/Correction:
{suggestion}

TASK: Rewrite the Original Chunk to incorporate the Professor's suggestion perfectly. 
Maintain the academic tone. Do not add conversational filler. Output ONLY the refined text.
"""
        refined_text = call_llm(prompt)
        new_vec = embed_query(refined_text)
        
        # Update the specific chunk in DB
        # Note: In a production system, we'd use UUIDs for chunks. 
        # Here we match by exact text or ID if we had it.
        cursor.execute("UPDATE knowledge_base SET text_chunk = ?, embedding = ? WHERE text_chunk = ?", 
                       (refined_text, json.dumps(new_vec.tolist()), text))
        
    conn.commit()
    conn.close()
    return True

def build_prompt(question, chunks, negative_constraints=""):
    sources_text = ""
    for i, chunk in enumerate(chunks, start=1):
        sources_text += f"[Source {i}]\n{chunk}\n\n"

    constraint_text = f"IMPORTANT RULE(S) FROM USER FEEDBACK: {negative_constraints}\n" if negative_constraints else ""

    system_prompt = f"""
You are a senior research assistant. Use the following chunks to answer:
{sources_text}

Negative Constraints (What NOT to do):
{negative_constraints}

INSTRUCTIONS:
1. Maintain a high-end, academic tone.
2. If the explanation involves a process, workflow, sequence, or architecture (especially coding), generate a Mermaid.js diagram.
   Use the format: ```mermaid
   [diagram code]
   ```
3. Do not use emojis. Use professional language.
4. Keep citations subtle but factual. Mention specific sources if needed.
"""
    full_prompt = f"{system_prompt}\n\nUSER QUESTION: {question}"
    return full_prompt.strip()

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
