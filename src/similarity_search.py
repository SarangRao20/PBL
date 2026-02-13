import pandas as pd
import numpy as np
import ast
import requests

EMBEDDINGS_FILE = "C://Users//Sarang//OneDrive//Desktop//PBL//data//embeddings//embeddings.csv"
OLLAMA_EMBED_URL = "http://localhost:11434/api/embeddings"
EMBED_MODEL = "nomic-embed-text"
TOP_K = 3

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

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


# --- Load embeddings ---
df = pd.read_csv(EMBEDDINGS_FILE)

# Convert string -> vector
df["embedding"] = df["embedding"].apply(ast.literal_eval)
df["embedding"] = df["embedding"].apply(np.array)

print(f"Loaded {len(df)} embedded chunks")


# --- User query ---
query = input("\nEnter your question: ")

query_vec = embed_query(query)

# --- Compute similarity ---
df["similarity"] = df["embedding"].apply(
    lambda x: cosine_similarity(query_vec, x)
)

# --- Rank ---
results = df.sort_values(by="similarity", ascending=False).head(TOP_K)

print("\nTop relevant chunks:\n")

for _, row in results.iterrows():
    score = round(row["similarity"] * 100, 2)
    print(f"Relatedness: {score}%")
    print(row["text"][:500])
    print("-" * 80)