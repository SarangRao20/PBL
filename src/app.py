import os
import sys
# Add the parent directory to Python path so `src` imports work regardless of CWD.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uuid
import sqlite3
import json
from flask import Flask, render_template, request, jsonify, session
from werkzeug.utils import secure_filename
from src.database import get_db_connection, SQLITE_DB_PATH
from src.answer_generation import embed_query, retrieve_top_chunks, build_prompt, call_llm
from src.web_scraper import scrape_and_ingest_url
from src.upload_handler import handle_document_upload
from src.autonomous_search import autonomous_web_search

app = Flask(__name__, template_folder="../templates", static_folder="../static")
app.secret_key = "qmodule_super_secret"  # Needed for sessions

# Configure upload path
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "..", "data", "raw_text")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# --- ROUTES ---

@app.route("/")
def index():
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())
        session["role"] = "student"
        session["author"] = "Guest Student"
        # Track in DB
        conn = get_db_connection()
        conn.execute("INSERT INTO sessions (session_id, role, author) VALUES (?, ?, ?)", 
                     (session["session_id"], session["role"], session["author"]))
        conn.commit()
        conn.close()
    
    return render_template("index.html", role=session.get("role"))

@app.route("/set_role", methods=["POST"])
def set_role():
    data = request.json
    session["role"] = data.get("role", "student")
    session["author"] = data.get("author", "Guest User")
    
    conn = get_db_connection()
    conn.execute("UPDATE sessions SET role=?, author=? WHERE session_id=?", 
                 (session["role"], session["author"], session["session_id"]))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True, "role": session["role"], "author": session["author"]})

@app.route("/chat", methods=["POST"])
def chat():
    """Handles Q&A matching Phase 4 and Phase 5 from paper"""
    data = request.json
    question = data.get("question")
    session_id = session.get("session_id")
    role = session.get("role", "student")
    author = session.get("author", "Guest Student")
    
    if not question:
        return jsonify({"error": "No question provided"}), 400

    conn = get_db_connection()
    
    try:
        # 1. Fetch negative RLHF constraints
        cursor = conn.cursor()
        cursor.execute('''
            SELECT correction_text FROM feedback f 
            JOIN messages m ON f.message_id = m.id 
            WHERE f.feedback_type = -1
        ''')
        bad_feedback = [row[0] for row in cursor.fetchall()]
        constraints_str = "; ".join(bad_feedback)
        
        # 2. Embed Query
        query_vec = embed_query(question)
        
        # 3. Retrieve Top Chunks (Role filtered)
        top_chunks = retrieve_top_chunks(query_vec, role_filter=role, author_filter=author)
        
        # AUTONOMOUS SEARCH FALLBACK: If best match < 50% similar, search the web!
        if not top_chunks or float(top_chunks[0][0]) < 0.50:
            print("Low confidence! Triggering autonomous web search...")
            if autonomous_web_search(question, role=role, author=author):
                # We found new things online, retrieve again!
                top_chunks = retrieve_top_chunks(query_vec, role_filter=role, author_filter=author)
                
        chunks_text = [t for sim, t in top_chunks]
        sources = [{"text": t, "score": round(float(sim)*100, 2)} for sim, t in top_chunks]
        
        # 4. Generate Answer
        prompt = build_prompt(question, chunks_text, negative_constraints=constraints_str)
        answer = call_llm(prompt)
        
        # 5. Save Interaction
        cursor.execute("INSERT INTO messages (session_id, role, content) VALUES (?, 'user', ?)", (session_id, question))
        cursor.execute("INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)", (session_id, answer))
        msg_id = cursor.lastrowid
        conn.commit()
        
        return jsonify({"answer": answer, "sources": sources, "message_id": msg_id})
        
    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.route("/feedback", methods=["POST"])
def feedback():
    """RLHF loop feedback"""
    data = request.json
    message_id = data.get("message_id")
    feedback_type = data.get("type", 1)  # 1 or -1
    correction = data.get("correction_text", "")
    
    try:
        conn = get_db_connection()
        conn.execute("INSERT INTO feedback (message_id, feedback_type, correction_text) VALUES (?, ?, ?)",
                     (message_id, feedback_type, correction))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/scrape", methods=["POST"])
def scrape():
    """Web scraping API"""
    data = request.json
    url = data.get("url")
    if not url:
        return jsonify({"error": "No URL provided"}), 400
        
    role = session.get("role", "student")
    author = session.get("author", "Guest Student")
    
    success = scrape_and_ingest_url(url, role=role, author=author, context="web_upload")
    if success:
        return jsonify({"success": True, "message": "URL scraped and embedded successfully."})
    return jsonify({"error": "Failed to scrape URL."}), 500

@app.route("/upload", methods=["POST"])
def upload_file():
    """Document upload API"""
    if 'document' not in request.files:
        return jsonify({"error": "No document part"}), 400
        
    file = request.files['document']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file and (file.filename.endswith(".pdf") or file.filename.endswith(".txt")):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        role = session.get("role", "student")
        author = session.get("author", "Guest user")
        
        success, msg = handle_document_upload(filepath, filename, role=role, author=author)
        
        # Feel free to remove the raw file after chunking to save space
        if os.path.exists(filepath):
            os.remove(filepath)
            
        if success:
            return jsonify({"success": True, "message": msg})
        else:
            return jsonify({"error": msg}), 500
            
    return jsonify({"error": "Invalid file format. Upload .pdf or .txt"}), 400


# ==========================================
# TEACHER "HUMAN-IN-THE-LOOP" KNOWLEDGE BASE
# ==========================================
@app.route("/api/knowledge_base", methods=["GET"])
def get_kb():
    if session.get("role") != "teacher":
        return jsonify({"error": "Unauthorized"}), 403
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, text_chunk, author, doc_type, timestamp FROM knowledge_base ORDER BY timestamp DESC")
    rows = cursor.fetchall()
    conn.close()
    
    chunks = [{"id": r[0], "text_chunk": r[1], "author": r[2], "doc_type": r[3], "timestamp": r[4]} for r in rows]
    return jsonify({"chunks": chunks})

@app.route("/api/knowledge_base/<chunk_id>", methods=["PUT"])
def update_kb(chunk_id):
    if session.get("role") != "teacher":
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.json
    new_text = data.get("text_chunk")
    
    # We must RE-EMBED the text because it changed!
    try:
        new_vec = embed_query(new_text)
        
        conn = get_db_connection()
        conn.execute("UPDATE knowledge_base SET text_chunk=?, embedding=? WHERE id=?", 
                     (new_text, json.dumps(new_vec.tolist()), chunk_id))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/knowledge_base/<chunk_id>", methods=["DELETE"])
def delete_kb(chunk_id):
    if session.get("role") != "teacher":
        return jsonify({"error": "Unauthorized"}), 403
        
    conn = get_db_connection()
    conn.execute("DELETE FROM knowledge_base WHERE id=?", (chunk_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
