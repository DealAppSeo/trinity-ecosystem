import os
from cdp import Cdp, Wallet
import structlog

logger = structlog.get_logger("cdp-service")

class CdpService:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CdpService, cls).__new__(cls)
        return cls._instance

    def initialize(self):
        if self._initialized:
            return
        
        api_key_name = os.getenv("COINBASE_API_KEY")
        api_key_private_key = os.getenv("COINBASE_API_SECRET")

        if not api_key_name or not api_key_private_key:
            logger.warning("Coinbase API keys missing. CDP Service disabled.")
            return

        try:
            # Handle newline in secret if provided as string
            api_key_private_key = api_key_private_key.replace("\\n", "\n")
            
            Cdp.configure(api_key_name, api_key_private_key)
            self._initialized = True
            logger.info("CDP Service initialized successfully.")
        except Exception as e:
            logger.error(f"CDP Initialization failed: {str(e)}")

    def create_wallet(self, network_id: str = "base-sepolia"):
        if not self._initialized:
            raise Exception("CDP Service not initialized")
        
        wallet = Wallet.create(network_id=network_id)
        logger.info(f"Wallet created: {wallet.id} on {network_id}")
        return wallet

    def get_wallet(self, wallet_id: str):
        if not self._initialized:
            raise Exception("CDP Service not initialized")
        return Wallet.fetch(wallet_id)

    async def fund_wallet(self, wallet):
        """Request testnet funds if on base-sepolia."""
        if wallet.network_id == "base-sepolia":
            faucet_tx = wallet.faucet()
            logger.info(f"Faucet requested for {wallet.default_address}: {faucet_tx}")
            return faucet_tx
        return None

cdp_service = CdpService()
