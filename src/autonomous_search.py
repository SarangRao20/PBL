from duckduckgo_search import DDGS
from src.web_scraper import scrape_and_ingest_url

def autonomous_web_search(query, role="student", author="System"):
    """
    Uses DuckDuckGo to find the top relevant link for a query,
    scrapes it, and ingests it dynamically before answering.
    """
    print(f"Autonomous search triggered for: {query}")
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=2))
            
        sources_added = 0
        for res in results:
            url = res.get("href")
            if url:
                print(f"Found related link: {url}")
                success = scrape_and_ingest_url(url, role=role, author=author, context=f"auto_search:{query}")
                if success:
                    sources_added += 1
                    
        return sources_added > 0
    except Exception as e:
        print(f"Autonomous search failed: {e}")
        return False
