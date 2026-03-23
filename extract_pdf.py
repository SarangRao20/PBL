from pypdf import PdfReader
reader = PdfReader("c:/Users/Sarang/OneDrive/Desktop/PBL/research_paper.pdf")
text = ""
for page in reader.pages:
    text += page.extract_text() + "\n"
with open("c:/Users/Sarang/OneDrive/Desktop/PBL/research_paper.txt", "w", encoding="utf-8") as f:
    f.write(text)
print("done")

#this code uses the pypdf library to read a PDF file, extract its text content, and save it to a new text file. Make sure to install the pypdf library if you haven't already by running `pip install pypdf`.