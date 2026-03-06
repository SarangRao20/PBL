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
    """
    Embeds a query using local Ollama with error handling.
    """
    try:
        response = requests.post(
            OLLAMA_EMBED_URL,
            json={
                "model": EMBED_MODEL,
                "prompt": query
            },
            timeout=30
        )
        response.raise_for_status()
        result = response.json()
        
        if "embedding" not in result:
            raise Exception("Ollama returned response without embedding")
            
        return np.array(result["embedding"])
        
    except requests.exceptions.Timeout:
        raise Exception("Ollama embedding request timed out. Is Ollama running?")
    except requests.exceptions.ConnectionError:
        raise Exception("Cannot connect to Ollama. Please ensure Ollama is running at http://localhost:11434")
    except Exception as e:
        raise Exception(f"Embedding failed: {str(e)}")

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

CORE INSTRUCTIONS:
1. Maintain a high-end, academic tone with clear, comprehensive explanations.
2. Do not use emojis. Use professional language.
3. Keep citations subtle but factual. Mention specific sources if needed.

MERMAID DIAGRAM REQUIREMENTS:
**ALWAYS generate a Mermaid diagram when the topic involves:**
- Processes, workflows, or sequences
- System architectures or data flows
- Algorithms or decision trees
- Relationships between concepts/components
- Timelines or event sequences
- Class structures or hierarchies

**Mermaid Diagram Best Practices:**
- Choose the RIGHT diagram type:
  * `flowchart TD` or `flowchart LR` - for processes, algorithms, workflows
  * `sequenceDiagram` - for interactions between entities over time
  * `classDiagram` - for object-oriented structures and relationships
  * `graph TD` or `graph LR` - for concept maps and relationships
  * `stateDiagram-v2` - for state machines and transitions
  * `journey` - for user journeys and experiences
  * `gantt` - for timelines and project planning

- Use DESCRIPTIVE node labels (not just A, B, C)
- Add styling for clarity: `style nodeId fill:#f9f,stroke:#333,stroke-width:4px`
- Use subgraphs for grouping related components
- Include clear arrow labels for relationships
- Keep diagrams readable: 5-15 nodes optimal, max 20
- Use consistent naming conventions

**Example Mermaid Formats:**

For a process/workflow:
```mermaid
flowchart TD
    Start([User Query]) --> Parse[Parse Input]
    Parse --> Validate{{Valid?}}
    Validate -->|Yes| Process[Process Request]
    Validate -->|No| Error[Return Error]
    Process --> Database[(Database)]
    Database --> Response[Generate Response]
    Response --> End([Return to User])
    
    style Start fill:#e1f5e1
    style End fill:#e1f5e1
    style Error fill:#ffe1e1
```

For system architecture:
```mermaid
graph TB
    subgraph Frontend
        UI[User Interface]
        API[API Client]
    end
    
    subgraph Backend
        Server[Flask Server]
        Auth[Authentication]
        DB[(Database)]
    end
    
    subgraph External
        LLM[LLM Service]
        Search[Web Search]
    end
    
    UI --> API
    API --> Server
    Server --> Auth
    Server --> DB
    Server --> LLM
    Server --> Search
    
    style Frontend fill:#e3f2fd
    style Backend fill:#f3e5f5
    style External fill:#fff3e0
```

For interactions:
```mermaid
sequenceDiagram
    participant User
    participant System
    participant Database
    participant AI
    
    User->>System: Submit Query
    System->>Database: Search Embeddings
    Database-->>System: Return Results
    alt High Confidence
        System->>AI: Generate Answer
        AI-->>System: Response
    else Low Confidence
        System->>Web: Search Online
        Web-->>System: New Data
        System->>AI: Generate Answer
        AI-->>System: Response
    end
    System-->>User: Display Answer
```

**IMPORTANT**: Generate diagram BEFORE the detailed explanation. Place it at the start of your response for maximum impact.

Format: 
1. Brief introduction (1-2 sentences)
2. Mermaid diagram (if applicable)
3. Detailed explanation broken into clear sections
4. Summary or key takeaways
"""
    full_prompt = f"{system_prompt}\n\nUSER QUESTION: {question}"
    return full_prompt.strip()

def call_llm(prompt):
    """
    Calls the LLM with better error handling.
    Raises exceptions that should be caught by the caller.
    """
    try:
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
        result = response.json()
        
        if "choices" not in result or len(result["choices"]) == 0:
            raise Exception("LLM returned empty response")
            
        return result["choices"][0]["message"]["content"]
        
    except requests.exceptions.Timeout:
        raise Exception("LLM API request timed out. Please try again.")
    except requests.exceptions.ConnectionError:
        raise Exception("Cannot connect to LLM API. Please check your internet connection.")
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            raise Exception("LLM API authentication failed. Please check your API key.")
        elif e.response.status_code == 429:
            raise Exception("LLM API rate limit exceeded. Please try again later.")
        else:
            raise Exception(f"LLM API error: {e.response.status_code}")
    except Exception as e:
        # Re-raise with more context
        raise Exception(f"LLM call failed: {str(e)}")
