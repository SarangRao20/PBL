from pypdf import PdfReader
import os

PDF_DIR = "C:\\Users\\Sarang\\OneDrive\\Desktop\\PBL\\data\\raw_text"
OUTPUT_DIR = "C:\\Users\\Sarang\\OneDrive\\Desktop\\PBL\\data\\extracted_text"

for file in os.listdir(PDF_DIR):
	if file.endswith(".pdf"):
		reader = PdfReader(os.path.join(PDF_DIR, file))

		text = ""

		for page in reader.pages:
			text += page.extract_text() + '\n'

		out_file = os.path.join(OUTPUT_DIR, file.replace(".pdf", ".txt"))

		with open(out_file, "w", encoding="utf-8") as f:
			f.write(text)

		print(f"Extracted: {file}")