import os
import uuid
import requests
import json
from tqdm import tqdm
try:
    from database import get_db_connection
except ImportError:
    from src.database import get_db_connection

def embed(text):
    print(f"Embedding chunk ({len(text)} chars)...")
    try:
        response = requests.post(
            "http://localhost:11434/api/embeddings",
            json={
                "model": "nomic-embed-text",
                "prompt": text
            },
            timeout=60
        )
        response.raise_for_status()
        return response.json()["embedding"]
    except requests.exceptions.HTTPError as e:
        print("Error embedding chunk:", e)
        return None

def ingest_chunks_to_db(chunks, role="teacher", author="Professor", doc_type="core_material"):
    """
    Ingest text chunks into SQLite database with metadata and JSON embeddings.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    count = 0
    
    for chunk in tqdm(chunks, desc="Generating Embeddings"):
        if not chunk.strip():
            continue
            
        vector = embed(chunk)
        if vector is None:
            continue
            
        chunk_id = str(uuid.uuid4())
        
        cursor.execute('''
            INSERT INTO knowledge_base (id, text_chunk, embedding, role, author, doc_type)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (chunk_id, chunk, json.dumps(vector), role, author, doc_type))
        count += 1
        
    conn.commit()
    conn.close()
    
    if count:
        print(f"✅ Successfully ingested {count} chunks to SQLite Knowledge Base.")
    else:
        print("⚠️ No valid chunks to ingest.")

if __name__ == "__main__":
    # Test migration from old chunks.txt
    chunk_file = "C://Users//Sarang//OneDrive//Desktop//PBL//data//chunks//chunks.txt"
    if os.path.exists(chunk_file):
        with open(chunk_file, encoding="utf-8") as f:
            raw = f.read()
        old_chunks = [c.strip() for c in raw.split("===CHUNK===") if c.strip()]
        print(f"Found {len(old_chunks)} chunks from old system. Migrating...")
        
        ingest_chunks_to_db(old_chunks, role="teacher", author="System", doc_type="PDF")
    else:
        print("No old chunks found.")
