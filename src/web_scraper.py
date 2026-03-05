import requests
from bs4 import BeautifulSoup
from src.chunk_text import generate_chunks
from src.generate_embeddings import ingest_chunks_to_db

def scrape_and_ingest_url(url, role="student", author="user", context="custom_scrape"):
    """
    Scrapes text from a given URL, chunks it, and ingests it into SQLite Knowledge Base.
    """
    try:
        print(f"Scraping URL: {url}")
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
        res = requests.get(url, headers=headers, timeout=15)
        res.raise_for_status()
        
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Remove scripts and styles
        for element in soup(["script", "style", "nav", "footer", "header"]):
            element.extract()
            
        text = soup.get_text(separator=' ', strip=True)
        
        if not text:
            print(f"Warning: No text extracted from {url}")
            return False
            
        print(f"Extracted {len(text)} characters. Chunking...")
        chunks = generate_chunks(text)
        
        print(f"Ingesting {len(chunks)} chunks into SQLite...")
        ingest_chunks_to_db(chunks, role=role, author=author, doc_type=f"web_scrape:{context}")
        
        return True
        
    except Exception as e:
        print(f"Error scraping {url}: {e}")
        return False

# Test run
if __name__ == "__main__":
    test_url = "https://en.wikipedia.org/wiki/Artificial_intelligence"
    scrape_and_ingest_url(test_url, role="student", author="Sarang", context="testing")
