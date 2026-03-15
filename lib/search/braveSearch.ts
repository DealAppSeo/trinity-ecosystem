import axios from 'axios';

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BASE_URL = 'https://api.search.brave.com/res/v1/web/search';

export interface BraveSearchResult {
    title: string;
    url: string;
    description: string;
}

export async function performBraveSearch(query: string, count: number = 5): Promise<BraveSearchResult[]> {
    if (!BRAVE_API_KEY) {
        console.warn("[BRAVE SEARCH] No BRAVE_API_KEY found, returning mock results for query:", query);
        return [
            {
                title: "Mock Result 1",
                url: "https://example.com/1",
                description: `Mocked result for: ${query}`
            }
        ];
    }

    try {
        console.log(`[BRAVE SEARCH] Executing real-time web search for: "${query}"`);
        const response = await axios.get(BASE_URL, {
            params: {
                q: query,
                count: count
            },
            headers: {
                'Accept': 'application/json',
                'X-Subscription-Token': BRAVE_API_KEY
            }
        });

        if (response.data && response.data.web && response.data.web.results) {
            return response.data.web.results.map((r: any) => ({
                title: r.title,
                url: r.url,
                description: r.description
            }));
        }
        
        return [];
    } catch (error: any) {
        console.error(`[BRAVE SEARCH] Error conducting search:`, error.message);
        return [];
    }
}
