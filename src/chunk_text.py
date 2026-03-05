import os

def generate_chunks(text, chunk_size=500, overlap=50):
    """
    Takes raw text, splits it into overlapping chunks of word counts.
    Returns a list of string chunks.
    """
    words = text.split()
    chunks = []
    i = 0
    
    while i < len(words):
        chunk = words[i : i + chunk_size]
        chunks.append(" ".join(chunk))
        i += chunk_size - overlap
        
    return chunks

# If run as a script, process the raw_text folder (for legacy parity)
if __name__ == "__main__":
    TEXT_DIR = "C://Users//Sarang//OneDrive//Desktop//PBL//data//extracted_text"
    OP_FILE= "C://Users//Sarang//OneDrive//Desktop//PBL//data//chunks//chunks.txt"
    
    if os.path.exists(TEXT_DIR):
        all_chunks = []
        for file in os.listdir(TEXT_DIR):
            if file.endswith(".txt"):
                with open(os.path.join(TEXT_DIR, file), encoding="utf-8") as f:
                    text = f.read()
                    chunks = generate_chunks(text)
                    all_chunks.extend(chunks)
                    
        with open(OP_FILE, "w", encoding="utf-8") as out:
            for x in all_chunks:
                out.write(x + "\n===CHUNK===\n")
        print(f"Chunking complete. Wrote {len(all_chunks)} chunks to {OP_FILE}")