import requests
import json

url = "http://localhost:8000/anfis/reward"
data = {
    "action_type": "REFERRAL",
    "network_need": 0.9,
    "saturation": 0.1,
    "diversity_score": 0.8
}

try:
    print(f"Sending request to {url}...")
    response = requests.post(url, json=data)
    response.raise_for_status()
    result = response.json()
    print("Success!")
    print(json.dumps(result, indent=2))
    
    # Simple assertion
    if result['multiplier'] > 1.5:
        print("PASS: Multiplier reflects 'Jackpot' conditions.")
    else:
        print("FAIL: Multiplier too low for high-value input.")
        
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, 'response') and e.response:
        print(e.response.text)
