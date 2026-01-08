import requests
import json

url = "http://localhost:8000/market/bid"
data = {
    "task_id": "job-BYOK-123",
    "required_gpu": True,
    "required_ram_gb": 32,
    "strategy": "BALANCED",
    "secure_keys": {
        "AKASH_API_KEY": "sk_test_123456",
        "AWS_ACCESS_KEY": "AKIA_MOCK_KEY"
    }
}

try:
    print(f"Sending BYOK request to {url}...")
    response = requests.post(url, json=data)
    response.raise_for_status()
    result = response.json()
    print("Success!")
    # print(json.dumps(result, indent=2)) 
    
    # Verify logic didn't crash
    if result['winning_offer']:
        print("PASS: BYOK Request processed successfully.")
        
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, 'response') and e.response:
        print(e.response.text)
