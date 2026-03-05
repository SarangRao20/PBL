from pypdf import PdfReader
reader = PdfReader("c:/Users/Sarang/OneDrive/Desktop/PBL/research_paper.pdf")
text = ""
for page in reader.pages:
    text += page.extract_text() + "\n"
with open("c:/Users/Sarang/OneDrive/Desktop/PBL/research_paper.txt", "w", encoding="utf-8") as f:
    f.write(text)
print("done")
