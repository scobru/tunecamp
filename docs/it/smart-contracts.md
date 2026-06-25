# Guida Tecnica agli Smart Contract

TuneCamp utilizza una suite di smart contract in Solidity sulla **rete Base (Base Network)** per gestire la proprietà della musica sotto forma di NFT e gestire pagamenti sicuri.

## 1. Panoramica dei Contratti

- **`TuneCampFactory.sol`**: Un factory di proxy minimi compatibile con lo standard EIP-1167. Consente alla piattaforma di distribuire "cloni" dei contratti principali per ogni nuova istanza di artista con una frazione dei costi di gas rispetto a una normale pubblicazione.
- **`TuneCampCheckout.sol`**: Il processore di pagamento principale. Gestisce:
  - Gli acquisti effettuati in ETH o in USDC.
  - La ripartizione automatica dei ricavi tra l'artista e la tesoreria della piattaforma (Platform Treasury).
  - L'integrazione con il contratto NFT per l'operazione di minting.
- **`TuneCampNFT.sol`**: Un contratto basato sullo standard ERC-1155. Ogni traccia o album è rappresentato da un ID token univoco. Il possesso dell'NFT garantisce all'utente l'accesso ai download di alta qualità.

## 2. Sviluppo e Distribuzione (Deployment)

I contratti sono collocati all'interno della cartella `contracts/`.

### Prerequisiti
- Node.js
- Hardhat o Foundry (consigliato per la rete Base)
- Una chiave privata con ETH sulla rete Base per pagare il gas.

### Flusso di Distribuzione
1. **Deploy dei Contratti di Implementazione**: Viene eseguito il deploy del codice logico per `TuneCampCheckout` e `TuneCampNFT`.
2. **Deploy del Factory**: Viene eseguito il deploy di `TuneCampFactory` puntando agli indirizzi delle implementazioni create.
3. **Configurazione dell'Istanza**: Il server di TuneCamp utilizza il Factory per "generare" i propri contratti di checkout e NFT al primo avvio o su richiesta dell'amministratore.

## 3. Logica dei Ricavi On-Chain

Il contratto `TuneCampCheckout` rappresenta l'**applicazione on-chain** della politica di ripartizione universale delle commissioni della piattaforma. Mentre i pagamenti Stripe gestiscono la ripartizione tramite codice backend, i pagamenti Web3 sono immutabili e automatici:

```solidity
uint256 platformShare = (msg.value * adminFeeBps) / 10000;
uint256 artistShare = msg.value - platformShare;
payable(adminTreasury).transfer(platformShare);
payable(artistWallet).transfer(artistShare);
```

## 4. Integrazione con il Backend

Il backend (`src/server/routes/api/payments.ts`) interagisce con questi contratti tramite la libreria **Ethers.js**:
- **Verifica**: Analizza i log delle transazioni per verificare che sia stato effettuato il pagamento per uno specifico `trackId`.
- **Pubblicazione**: Richiama il contratto NFT per coniare (mint) nuove edizioni quando un artista pubblica la propria musica on-chain.

## 5. Sicurezza

- **ReentrancyGuard**: Applicato a tutte le funzioni che gestiscono pagamenti per prevenire attacchi di reentrancy.
- **AccessControl**: Solo l'amministratore dell'istanza o il factory della piattaforma possono richiamare funzioni di gestione sensibili.
- **Audit**: Questi contratti sono progettati puntando alla massima semplicità per ridurre al minimo la superficie di attacco.
