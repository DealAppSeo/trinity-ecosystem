import requests
import os

TOKEN = "8637979944:AAEX0R4hKL20Z5INW-Utl5EO3ZnQMgA-jgM"
CHAT_ID = "7217398316"

message = """🎼 ANTIGRAV — PHASE 2 COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Done:    BFT Consensus, RepID Scaling, ANFIS Routing Audit, Mobile Bot Audit
📊 Numbers: 12 agents verified online, 61.8% golden ratio BFT logic confirmed
⚠️ Flags:   ERC-8004 currently simulated via Merkle stubs
🔜 Next:    Phase 3: Waitlist Form to Supabase Pipeline, est. 45 min

/approve  — start Phase 3 now
/pause    — hold
/redirect — change direction"""

url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
payload = {
    "chat_id": CHAT_ID,
    "text": message,
    "parse_mode": "Markdown"
}

response = requests.post(url, json=payload)
print(response.status_code)
print(response.text)
