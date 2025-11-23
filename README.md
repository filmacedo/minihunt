# MiniHunt

**Weekly prediction market for Farcaster mini-apps where hunters bet on winners and earn rewards for discovering quality apps early.**

---

## Celo Integration

MiniHunt is built entirely on Celo using cUSD for all transactions. Our smart contracts handle:

- **Progressive Pricing Mechanism:** Each bet costs 3% more than the previous one (starting at $1), creating a linear pricing increase that rewards early discovery
- **Prize Pool Management:** 90% of all betting fees flow into the weekly prize pool, distributed 60/30/10 to top 3 apps
- **Proportional Reward Distribution:** Hunters earn based on their share of bets on winning apps
- **90-Day Claim Window:** Automated deadline enforcement with unclaimed funds returning to protocol

**How it was built:**
- Smart contracts deployed on Celo mainnet for stable, low-cost transactions
- All core game mechanics (submit, bet, claim) are fully onchain
- Integration with cUSD ensures predictable pricing without volatility
- Contracts tested extensively with Hardhat 3 for production readiness

The choice of Celo enables MiniHunt to offer a seamless user experience with stable pricing and minimal transaction costs, making it practical for frequent micro-transactions ($1-5) that power the prediction market.

---

## Team

**[@rubendinis](https://warpcast.com/rubendinis)**
Building in Web3 since 2021, previously founded Talent Protocol

**[@macedo](https://warpcast.com/macedo)**
Full-stack engineer with expertise in smart contracts and frontend systems

**[@simao](https://warpcast.com/simao)** 
Specialized in AI and UI development

**[@juampi](https://warpcast.com/juampi)**
Focused on user experience and Farcaster mini-app development

---

## Links

- **Live App:** [minihunt.xyz](https://minihunt.xyz)
- **API Docs:** [documenter.getpostman.com/view/3347257/2sB3dHVY36](https://documenter.getpostman.com/view/3347257/2sB3dHVY36)
- **Smart Contracts:** [View on Celo Explorer](https://celoscan.io/address/0x070a14c26d86B61155b0af07a699AD8a96809AA4)

---

## Tech Stack

- **Blockchain:** Celo
- **Smart Contracts:** Solidity, Hardhat 3
- **Frontend:** Next.js, React, Tailwind CSS
- **Backend:** Node.js, REST API
- **Platform:** Farcaster Mini-App

---

*Built for the Celo & Farcaster ecosystem*