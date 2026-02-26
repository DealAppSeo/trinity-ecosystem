# torch_emergent_cluster.py
# Zero cost: HF free tier embeddings + Supabase REST + GitHub Actions cron
import os, requests, numpy as np
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import normalize
from datetime import datetime, timedelta

HF_API     = 'https://api-inference.huggingface.co/pipeline/feature-extraction'
HF_MODEL   = 'sentence-transformers/all-MiniLM-L6-v2'  # Best free quality/speed
HF_TOKEN   = os.environ.get('HF_TOKEN')
SB_URL     = os.environ.get('SUPABASE_URL')
SB_KEY     = os.environ.get('SUPABASE_KEY')
TELEGRAM_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID')

MIN_CLUSTER_SIZE = 50    # Quality gate
SIMILARITY_EPS   = 0.25  # DBSCAN epsilon

def fetch_emergent_outputs(days_back=90):
    """Pull EMERGENT-flagged outputs from last quarter."""
    cutoff = (datetime.now() - timedelta(days=days_back)).isoformat()
    r = requests.get(f'{SB_URL}/rest/v1/trinity_tasks',
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'},
        params={'vulnerability_type': 'eq.EMERGENT', 'created_at': f'gte.{cutoff}',
                'select': 'id,output_summary,domain', 'limit': '2000'})
    return r.json()

def embed_batch(texts, batch_size=32):
    """Embed in batches to respect HF free tier rate limits."""
    vectors = []
    for i in range(0, len(texts), batch_size):
        r = requests.post(f'{HF_API}/{HF_MODEL}',
            headers={'Authorization': f'Bearer {HF_TOKEN}'}, json={'inputs': texts[i:i+batch_size]})
        vectors.extend(r.json())
    return normalize(np.array(vectors))

def cluster_and_surface(outputs):
    if not outputs: return []
    texts  = [o['output_summary'] for o in outputs]
    vecs   = embed_batch(texts)
    labels = DBSCAN(eps=SIMILARITY_EPS, min_samples=MIN_CLUSTER_SIZE,
                    metric='cosine').fit_predict(vecs)
    candidates = []
    for lbl in set(labels):
        if lbl == -1: continue 
        idxs = [i for i, l in enumerate(labels) if l == lbl]
        centroid_idx = idxs[np.argmin(
            [np.linalg.norm(vecs[i] - vecs[idxs].mean(0)) for i in idxs])]
        candidates.append({
            'cluster_label':        int(lbl),
            'size':                 len(idxs),
            'representative_text':  texts[centroid_idx],
            'domain':               outputs[centroid_idx]['domain'],
            'status':               'pending_review',
            'created_at':           datetime.now().isoformat()
        })
    return sorted(candidates, key=lambda x: -x['size'])

def push_candidates(candidates):
    if not candidates: return
    requests.post(f'{SB_URL}/rest/v1/taxonomy_candidates',
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}',
                 'Prefer': 'resolution=merge-duplicates'},
        json=candidates)
    
    msg = (f'🧬 EMERGENT Clustering Complete\n'
           f'{len(candidates)} taxonomy candidates surfaced.\n'
           f'Review: /taxonomy_review')
    
    if TELEGRAM_TOKEN and TELEGRAM_CHAT_ID:
        requests.post(
            f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage',
            json={'chat_id': TELEGRAM_CHAT_ID, 'text': msg})

if __name__ == '__main__':
    print("Starting EMERGENT clustering...")
    try:
        outputs    = fetch_emergent_outputs()
        print(f"Fetched {len(outputs)} emergent outputs.")
        candidates = cluster_and_surface(outputs)
        print(f"Identified {len(candidates)} candidates.")
        push_candidates(candidates)
        print("Done.")
    except Exception as e:
        print(f"Error: {e}")
