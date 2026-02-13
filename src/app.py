from flask import Flask, render_template, request
from answer_generation import embed_query, cosine_similarity, build_prompt, call_llm
import pandas as pd
import numpy as np
import ast

app = Flask(__name__, template_folder="../templates")

# ---------- CONFIG ----------
EMBEDDINGS_FILE = "C://Users//Sarang//OneDrive//Desktop//PBL//data//embeddings//embeddings.csv"
TOP_K = 3
# ---------------------------

# Load embeddings ONCE at startup
df = pd.read_csv(EMBEDDINGS_FILE)
df["embedding"] = df["embedding"].apply(ast.literal_eval).apply(np.array)

@app.route("/", methods=["GET", "POST"])
def index():
    answer = None
    sources = []

    if request.method == "POST":
        question = request.form["question"]

        # Phase 4: Retrieval
        query_vec = embed_query(question)

        df["similarity"] = df["embedding"].apply(
            lambda x: cosine_similarity(query_vec, x)
        )

        top_chunks = df.sort_values(
            by="similarity", ascending=False
        ).head(TOP_K)

        chunks = top_chunks["text"].tolist()
        scores = (top_chunks["similarity"] * 100).round(2).tolist()

        # Phase 5: Generation
        prompt = build_prompt(question, chunks)
        answer = call_llm(prompt)

        sources = list(zip(chunks, scores))

    return render_template("index.html", answer=answer, sources=sources)

if __name__ == "__main__":
    app.run(debug=True)
