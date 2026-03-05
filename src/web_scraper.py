import requests
from bs4 import BeautifulSoup
from src.chunk_text import generate_chunks
from src.generate_embeddings import ingest_chunks_to_db

def scrape_and_ingest_url(url, role="student", author="user", context="custom_scrape", job_id=None, progress_callback=None):
    """
    Scrapes text from a given URL, chunks it, and ingests it into SQLite Knowledge Base.
    """
    try:
        if progress_callback: progress_callback(job_id, 0, 100, "Extracting text from URL...")
        print(f"Scraping URL: {url}")
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
        res = requests.get(url, headers=headers, timeout=15)
        res.raise_for_status()
        
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Capture image alt-text and metadata before extracting tags
        for img in soup.find_all('img'):
            alt = img.get('alt', '').strip()
            if alt:
                # Insert alt-text into the document at the image's location
                img.insert_before(f" [Image Context: {alt}] ")
        
        # Remove scripts and styles
        for element in soup(["script", "style", "nav", "footer", "header"]):
            element.extract()
            
        text = soup.get_text(separator=' ', strip=True)
        
        if not text:
            print(f"Warning: No text extracted from {url}")
            return False
            
        print(f"Extracted {len(text)} characters. Chunking...")
        if progress_callback: progress_callback(job_id, 10, 100, "Chunking document...")
        chunks = generate_chunks(text)
        
        print(f"Ingesting {len(chunks)} chunks into SQLite...")
        source_id = f"SRC-{url.split('//')[-1][:20]}"
        doc_type = f"Web: {url}"
        
        ingest_chunks_to_db(chunks, role=role, author=author, doc_type=doc_type, job_id=job_id, progress_callback=progress_callback)
        
        return True, "Successfully indexed URL."
        
    except Exception as e:
        print(f"Error scraping {url}: {e}")
        return False, str(e)

# Test run
if __name__ == "__main__":
    test_url = "https://en.wikipedia.org/wiki/Artificial_intelligence"
    scrape_and_ingest_url(test_url, role="student", author="Sarang", context="testing")
