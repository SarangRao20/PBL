from ddgs import DDGS  # type: ignore
from src.web_scraper import scrape_and_ingest_url

def autonomous_web_search(query, role="student", author="System"):
    """
    Uses DuckDuckGo to find the top relevant link for a query,
    scrapes it, and ingests it dynamically before answering.
    """
    print(f"Autonomous search triggered for: {query}")
    try:
        with DDGS() as ddgs:
            # Refine query for research context
            academic_query = f"{query} academic research paper definition"
            results = list(ddgs.text(academic_query, max_results=3))
            
        if not results:
            print("DuckDuckGo returned no results")
            return False
            
        sources_added = 0
        for res in results:
            url = res.get("href")
            if url:
                print(f"Found related link: {url}")
                try:
                    success = scrape_and_ingest_url(url, role=role, author=author, context=f"auto_search:{query}")
                    if success:
                        sources_added += 1
                except Exception as scrape_error:
                    print(f"Failed to scrape {url}: {scrape_error}")
                    continue
                    
        if sources_added > 0:
            print(f"Successfully added {sources_added} sources from web search")
            return True
        else:
            print("No sources could be scraped and ingested")
            return False
            
    except Exception as e:
        print(f"Autonomous search failed: {e}")
        return False
