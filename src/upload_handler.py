import os
from pypdf import PdfReader
from src.chunk_text import generate_chunks
from src.generate_embeddings import ingest_chunks_to_db

def handle_document_upload(file_path, filename, role="teacher", author="Professor"):
    """
    Extracts text from PDF/TXT, chunks it, and ingests into Knowledge Base.
    """
    try:
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
            
        chunks = generate_chunks(text)
        ingest_chunks_to_db(chunks, role=role, author=author, doc_type=f"upload:{filename}")
        
        return True, f"Successfully processed {len(chunks)} chunks from {filename}"
        
    except Exception as e:
        return False, str(e)
