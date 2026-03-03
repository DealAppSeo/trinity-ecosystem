
import os
import asyncio
from alpaca.crypto.client import CryptoClient
from dotenv import load_dotenv

load_dotenv('.env.local')

api_key = os.getenv('ALPACA_API_KEY')
secret_key = os.getenv('ALPACA_SECRET_KEY')

async def check_assets():
    print(f"--- 🔍 VERIFYING ALPACA SYMBOLS (Step 3) ---")
    client = CryptoClient(api_key=api_key, secret_key=secret_key)
    
    # We want to check DOT, AAVE, LTC, UNI
    assets_to_check = ['DOT/USD', 'AAVE/USD', 'LTC/USD', 'UNI/USD']
    
    # Alpaca crypto assets often use symbols like BTC/USD
    # Let's see if we can get all assets and filter
    try:
        from alpaca.trading.client import TradingClient
        trading_client = TradingClient(api_key, secret_key, paper=True)
        all_assets = trading_client.get_all_assets()
        
        found = []
        for asset in all_assets:
            if asset.asset_class == 'crypto' and any(target in asset.symbol for target in ['DOT', 'AAVE', 'LTC', 'UNI']):
                found.append({
                    'symbol': asset.symbol, 
                    'tradable': asset.tradable, 
                    'status': asset.status,
                    'easy_borrowable': getattr(asset, 'easy_borrowable', 'N/A')
                })
        
        if not found:
            print("No assets found matching the targets.")
        else:
            for f in found:
                print(f"✅ Found: {f}")
                
    except Exception as e:
        print(f"❌ Error during asset verification: {e}")

if __name__ == "__main__":
    asyncio.run(check_assets())
