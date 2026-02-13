import os
import requests
import pandas as pd
from tqdm import tqdm

chunk_file = "C://Users//Sarang//OneDrive//Desktop//PBL//data//chunks//chunks.txt"
out_file = "C://Users//Sarang//OneDrive//Desktop//PBL//data//embeddings//embeddings.csv"

with open(chunk_file, encoding = "utf-8") as f:
    raw = f.read()

chunks = [c.strip() for c in raw.split("===CHUNK===") if c.strip()]
print(f"Total chunks: {len(chunks)}")

# øllama embedding function
def embed(text):
    print("\n--- Embedding chunk ---")
    print(f"Chunk length: {len(text)}")
    print(f"Chunk preview: {text[:200]}{'...' if len(text) > 200 else ''}")
    try:
        response = requests.post(
            "http://localhost:11434/api/embeddings",
            json = {
                 "model": "nomic-embed-text",
                "prompt": text
            },
            timeout=60
        )
        response.raise_for_status()
        return response.json()["embedding"]
    except requests.exceptions.HTTPError as e:
        print("Error embedding chunk:", e)
        print("Response text:", getattr(e.response, 'text', None))
        return None

# --- Test API connection ---
def test_embed_api():
    try:
        test_text = "Hello world"
        response = requests.post(
            "http://localhost:11434/api/embeddings",
            json={
                "model": "nomic-embed-text",
                "prompt": test_text
            },
            timeout=10
        )
        print("Test API status code:", response.status_code)
        print("Test API response:", response.text)
    except Exception as e:
        print("Test API error:", e)

if __name__ == "__main__":
    test_embed_api()

# --- Generate embeddings ---
rows = []

for idx, chunk in enumerate(tqdm(chunks)):
    vector = embed(chunk)
    rows.append({
        "chunk_id": idx,
        "text": chunk,
        "embedding": vector
    })

# --- Save to CSV ---
df = pd.DataFrame(rows)
df.to_csv(out_file, index=False)

print("✅ Embeddings generated and saved.")

