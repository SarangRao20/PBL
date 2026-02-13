import os 

TEXT_DIR = "C://Users//Sarang//OneDrive//Desktop//PBL//data//extracted_text"
OP_FILE= "C://Users//Sarang//OneDrive//Desktop//PBL//data//chunks//chunks.txt"

chunk_size = 500
overlap = 50

def chunk_text(text):
	words = text.split()
	chunks = []
	i = 0

	while i < len(words):
		chunk = words[i : i + chunk_size]
		chunks.append(" ".join(chunk))

		i += chunk_size - overlap

	return chunks

with open(OP_FILE, "w", encoding = "utf-8") as out:
	for file in os.listdir(TEXT_DIR):
		with open(os.path.join(TEXT_DIR, file), encoding = "utf-8") as f:
			text = f.read()
			chunks = chunk_text(text)

			for x in chunks:
				out.write(x + "\n===CHUNK===\n")

print("Chunking complete")