import os
import sys
# Add the parent directory to Python path so `src` imports work regardless of CWD.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uuid
import sqlite3
import json
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.utils import secure_filename
from functools import wraps
from src.database import get_db_connection, SQLITE_DB_PATH
from src.answer_generation import embed_query, retrieve_top_chunks, build_prompt, call_llm, refine_chunks_with_feedback
from src.web_scraper import scrape_and_ingest_url
from src.upload_handler import handle_document_upload
from src.autonomous_search import autonomous_web_search
from src.chunk_text import generate_chunks
from src.generate_embeddings import ingest_chunks_to_db

import threading

# Global state for background ingestion jobs
INGESTION_JOBS = {}

def update_job_progress(job_id, current, total, message):
    if job_id in INGESTION_JOBS:
        progress = int((current / total) * 100) if total > 0 else 0
        INGESTION_JOBS[job_id]["progress"] = progress
        INGESTION_JOBS[job_id]["message"] = message

app = Flask(__name__, template_folder="../templates", static_folder="../static")
app.secret_key = "qmodule_super_secret"  # Needed for sessions

# Configure upload path
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "..", "data", "raw_text")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# --- ROUTES ---

# --- AUTH WRAPPER ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function

def teacher_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("role") != "teacher":
            return jsonify({"error": "Unauthorized. Professor access required."}), 403
        return f(*args, **kwargs)
    return decorated_function

@app.route("/")
@login_required
def index():
    return render_template("index.html", role=session.get("role"))

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        role = request.form.get("role")

        # Dummy Auth Logic
        if username == "professor" and password == "admin":
            session["user_id"] = str(uuid.uuid4())
            session["role"] = "teacher"
            session["author"] = "Professor " + username.capitalize()
            return redirect(url_for("index"))
        elif username == "student" and password == "student":
            session["user_id"] = str(uuid.uuid4())
            session["role"] = "student"
            session["author"] = "Student " + username.capitalize()
            return redirect(url_for("index"))
        else:
            return render_template("login.html", error="Invalid credentials. Use professor/admin or student/student.")

    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# Removed /set_role as we use /login now.

@app.route("/chat", methods=["POST"])
def chat():
    """Handles Q&A matching Phase 4 and Phase 5 from paper"""
    data = request.json
    question = data.get("question")
    user_id = session.get("user_id")
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
        cursor.execute("INSERT INTO messages (session_id, role, content) VALUES (?, 'user', ?)", (user_id, question))
        cursor.execute("INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)", (user_id, answer))
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
    context = data.get("context", "")
    
    try:
        conn = get_db_connection()
        conn.execute("INSERT INTO feedback (message_id, feedback_type, correction_text, context) VALUES (?, ?, ?, ?)",
                     (message_id, feedback_type, correction, context))
        conn.commit()
        conn.close()
        
        # Trigger Self-Correcting Refinement if Professor provided feedback
        if context == "self_correcting_loop" and session.get("role") == "teacher":
            from threading import Thread
            Thread(target=refine_chunks_with_feedback, args=(message_id, correction)).start()
            
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/job/<job_id>", methods=["GET"])
@teacher_required
def get_job_status(job_id):
    job = INGESTION_JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)

def run_scrape_job(job_id, url, role, author):
    try:
        def cb(jid, c, t, m):
            update_job_progress(jid, c, t, m)
            
        success, msg = scrape_and_ingest_url(url, role=role, author=author, context="web_upload", job_id=job_id, progress_callback=cb)
        if success:
            update_job_progress(job_id, 100, 100, "Successfully added to context!")
            INGESTION_JOBS[job_id]["status"] = "completed"
        else:
            INGESTION_JOBS[job_id]["status"] = "failed"
            INGESTION_JOBS[job_id]["message"] = msg
    except Exception as e:
        INGESTION_JOBS[job_id]["status"] = "failed"
        INGESTION_JOBS[job_id]["message"] = str(e)

@app.route("/scrape", methods=["POST"])
@teacher_required
def scrape():
    """Web scraping API"""
    data = request.json
    url = data.get("url")
    if not url:
        return jsonify({"error": "No URL provided"}), 400
        
    role = session.get("role", "student")
    author = session.get("author", "Guest Student")
    
    job_id = str(uuid.uuid4())
    INGESTION_JOBS[job_id] = {"status": "running", "progress": 0, "message": "Starting scrape..."}
    
    thread = threading.Thread(target=run_scrape_job, args=(job_id, url, role, author))
    thread.daemon = True
    thread.start()
    
    return jsonify({"success": True, "job_id": job_id, "message": "Scraping started in background."})

@app.route("/upload", methods=["POST"])
@teacher_required
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
        
        job_id = str(uuid.uuid4())
        INGESTION_JOBS[job_id] = {"status": "running", "progress": 0, "message": "Starting upload processing..."}
        
        def run_upload_job():
            try:
                def cb(jid, c, t, m):
                    update_job_progress(jid, c, t, m)
                    
                success, msg = handle_document_upload(filepath, filename, role=role, author=author, job_id=job_id, progress_callback=cb)
                if success:
                    update_job_progress(job_id, 100, 100, msg)
                    INGESTION_JOBS[job_id]["status"] = "completed"
                else:
                    INGESTION_JOBS[job_id]["status"] = "failed"
                    INGESTION_JOBS[job_id]["message"] = msg
            except Exception as e:
                INGESTION_JOBS[job_id]["status"] = "failed"
                INGESTION_JOBS[job_id]["message"] = str(e)
            finally:
                # Cleanup if needed
                pass
                
        thread = threading.Thread(target=run_upload_job)
        thread.daemon = True
        thread.start()
        
        return jsonify({"success": True, "job_id": job_id, "message": "Upload processing started in background."})
        
    return jsonify({"error": "Invalid file format. Only PDF and TXT are allowed."}), 400


# ==========================================
# TEACHER "HUMAN-IN-THE-LOOP" KNOWLEDGE BASE
# ==========================================
@app.route("/api/knowledge_base", methods=["GET"])
@teacher_required
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
@teacher_required
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
@teacher_required
def delete_kb(chunk_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM knowledge_base WHERE id=?", (chunk_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/analytics", methods=["GET"])
@teacher_required
def get_analytics():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Knowledge Base Composition
    cursor.execute("SELECT doc_type, COUNT(*) as count FROM knowledge_base GROUP BY doc_type")
    kb_composition = {row[0]: row[1] for row in cursor.fetchall()}
    
    # 2. Activity Trends (Last 7 days)
    cursor.execute("SELECT date(timestamp), COUNT(*) FROM messages WHERE role='user' GROUP BY date(timestamp) LIMIT 7")
    activity = {row[0]: row[1] for row in cursor.fetchall()}
    
    # 3. Top cited authors
    cursor.execute("SELECT author, COUNT(*) FROM knowledge_base GROUP BY author ORDER BY COUNT(*) DESC LIMIT 5")
    top_authors = {row[0]: row[1] for row in cursor.fetchall()}
    
    conn.close()
    return jsonify({
        "kb_composition": kb_composition,
        "activity": activity,
        "top_authors": top_authors
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)
