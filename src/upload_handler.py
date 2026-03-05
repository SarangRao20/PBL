import os
from pypdf import PdfReader
from src.chunk_text import generate_chunks
from src.generate_embeddings import ingest_chunks_to_db

def handle_document_upload(file_path, filename, role="teacher", author="Professor", job_id=None, progress_callback=None):
    """
    Extracts text from PDF/TXT, chunks it, and ingests into Knowledge Base.
    """
    try:
        if progress_callback: progress_callback(job_id, 0, 100, "Reading document...")
        text = ""
        if filename.endswith(".pdf"):
            reader = PdfReader(file_path)
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        elif filename.endswith(".txt"):
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
        else:
            return False, "Unsupported file format"
            
        if not text.strip():
            return False, "Document is empty or unreadable"
            
        if progress_callback: progress_callback(job_id, 10, 100, "Chunking text...")
        chunks = generate_chunks(text)
        
        source_id = f"SRC-{filename}"
        doc_type = f"Upload: {filename}"
        
        ingest_chunks_to_db(chunks, role=role, author=author, doc_type=doc_type, job_id=job_id, progress_callback=progress_callback)
        
        return True, f"Successfully processed {len(chunks)} chunks from {filename}"
        
    except Exception as e:
        return False, str(e)
