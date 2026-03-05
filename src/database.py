import os
import sqlite3
import json

# --- PATHS ---
DATA_DIR = "C://Users//Sarang//OneDrive//Desktop//PBL//data"
SQLITE_DB_PATH = os.path.join(DATA_DIR, "chat_history.db")

os.makedirs(DATA_DIR, exist_ok=True)

# --- SQLITE INIT ---
def get_db_connection():
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_sqlite():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Conversations table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            role TEXT,
            author TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Chat History
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            role TEXT, -- "user" or "assistant"
            content TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(session_id) REFERENCES sessions(session_id)
        )
    ''')
    
    # RLHF Feedback
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER,
            feedback_type INTEGER, -- 1 for up, -1 for down
            correction_text TEXT,
            context TEXT,  -- Store the query that led to this bad answer
            FOREIGN KEY(message_id) REFERENCES messages(id)
        )
    ''')
    
    # Embeddings / Knowledge Base
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS knowledge_base (
            id TEXT PRIMARY KEY,
            text_chunk TEXT,
            embedding JSON, -- store array as JSON string
            role TEXT,      -- 'teacher' or 'student'
            author TEXT,    -- who uploaded this
            doc_type TEXT,  -- 'core_material', 'web_scrape'
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    print("SQLite Database Initialized (including Knowledge Base).")

if __name__ == "__main__":
    init_sqlite()
