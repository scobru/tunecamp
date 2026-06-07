"""Native ETH balance checker on Base Mainnet."""

import os
from dotenv import load_dotenv
from web3 import Web3

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

RPC_URL = "https://mainnet.base.org"
PRIVATE_KEY = os.getenv("AGENT_WALLET_PRIVATE_KEY")

if not PRIVATE_KEY:
    raise EnvironmentError("AGENT_WALLET_PRIVATE_KEY not set in scripts/.env")

w3 = Web3(Web3.HTTPProvider(RPC_URL))
assert w3.is_connected(), "Cannot connect to Base Mainnet RPC"

account = w3.eth.account.from_key(PRIVATE_KEY)
address = account.address

balance_wei = w3.eth.get_balance(address)
balance_eth = w3.from_wei(balance_wei, "ether")

print(f"Address : {address}")
print(f"ETH     : {balance_eth:.6f} ETH")
