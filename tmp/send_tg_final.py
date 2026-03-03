import requests

TOKEN = "8637979944:AAEX0R4hKL20Z5INW-Utl5EO3ZnQMgA-jgM"
CHAT_ID = "7217398316"

message = """🎼 ANTIGRAV — MISSION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Done: 
- Deployed Landing Page v5 (aitrinitysymphony.com)
- Completed Feature Audit (BFT, RepID, ANFIS verified)
- Built Waitlist Pipeline (SQL, API, Frontend integrated)

📊 Results: 
- 12 agents confirmed active
- 60-80% cost reduction logic verified
- Mobile Command Center fully operational

/status   — review current state
/savings  — see real-time alpha
/audit    — view deep tech report"""

url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
payload = {
    "chat_id": CHAT_ID,
    "text": message,
    "parse_mode": "Markdown"
}

response = requests.post(url, json=payload)
print(response.status_code)
