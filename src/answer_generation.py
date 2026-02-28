import pandas as pd
import numpy as np
import ast
import requests
import os
from dotenv import load_dotenv

# ---------- CONFIG ----------

EMBEDDINGS_FILE = "data/embeddings/embeddings.csv"

OLLAMA_EMBED_URL = "http://localhost:11434/api/embeddings"
EMBED_MODEL = "nomic-embed-text"

TOP_K = 3   # number of chunks to use

# ----------------------------

load_dotenv()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

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

df = pd.read_csv(EMBEDDINGS_FILE)

# Convert stringified embeddings back to vectors
df["embedding"] = df["embedding"].apply(ast.literal_eval)
df["embedding"] = df["embedding"].apply(np.array)

print(f"Loaded {len(df)} embedded chunks")

def build_prompt(question, chunks):
    sources_text = ""
    for i, chunk in enumerate(chunks, start=1):
        sources_text += f"[Source {i}]\n{chunk}\n\n"

    prompt = f"""
You are an academic assistant.

Answer the question using ONLY the sources below.
If the answer cannot be found in the sources, say:
"I could not find this information in the provided material."

Sources:
{sources_text}

Question:
{question}
"""
    return prompt.strip()

def call_llm(prompt):
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
    return response.json()["choices"][0]["message"]["content"]

# ---------- MAIN PIPELINE ----------

# question = input("\nEnter your question: ")

# # Embed query
# query_vec = embed_query(question)

# # Compute similarity
# df["similarity"] = df["embedding"].apply(
#     lambda x: cosine_similarity(query_vec, x)
# )

# # Select top-K chunks
# top_chunks = df.sort_values(
#     by="similarity", ascending=False
# ).head(TOP_K)

# chunk_texts = top_chunks["text"].tolist()
# scores = (top_chunks["similarity"] * 100).round(2).tolist()

# # Build prompt
# prompt = build_prompt(question, chunk_texts)

# if max(scores) < 60:
#     print("\nANSWER:\n")
#     print("Insufficient relevant information found to answer confidently.")
#     exit()
# # Generate answer
# answer = call_llm(prompt)

# # Display output
# print("\nANSWER:\n")
# print(answer)

# print("\nSOURCES USED:\n")
# for i, score in enumerate(scores, start=1):
#     print(f"Source {i} — Relatedness: {score}%")
