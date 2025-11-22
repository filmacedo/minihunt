# MiniHunt - Product Specification

## Overview
Weekly prediction market for Farcaster mini-apps. Hunters bet on apps, top 3 split prize pool (60/30/10). Progressive pricing: $1 first bet, +3% each additional bet per app.

**Tagline:** "Bet on the best miniapps"

**Current Week:** Started Sat Nov 22, 2025 00:00 UTC

---

## Data Strategy

**Mock Data (Past 3 Weeks):**
- Week 47 (Nov 15-21) - Unclaimed winnings
- Week 46 (Nov 8-14) - Lost bets
- Week 45 (Nov 1-7) - Claimed winnings

**Real Data (Current & Future):**
- Week 48 (Nov 22-28) - Current active week
- Future weeks - Live from smart contracts

---

## User Flows

### 1. First-Time Visitor
1. Lands on home → sees welcome banner
2. Views prize pool + countdown
3. Browses apps or hunters leaderboard
4. Clicks vote button → betting modal opens

### 2. Hunter Bets on App
1. Clicks vote button on app card
2. Betting modal shows: app details, current rank, your bets, price
3. Confirms bet (transaction)
4. Share modal opens → share on Farcaster or skip

### 3. Builder Submits App
1. Clicks FAB (+ button)
2. Submit modal: enters URL, sees preview
3. Validates (URL valid, not duplicate)
4. Pays $1 (first bet)
5. App appears on leaderboard

### 4. Hunter Views Portfolio
1. Opens "My Bets" via menu
2. Current week: shows active bets, potential winnings (real data)
3. Past weeks: accordion with 3 mock weeks showing different states

### 5. Hunter Claims Rewards
1. Expands past week with winnings (mock data)
2. Clicks "Claim $X.XX"
3. Claim modal: shows breakdown, deadline
4. Confirms transaction
5. Success message

### 6. Hunter Shares
1. After bet/submit → share modal auto-opens
2. Pre-filled cast with app name
3. Clicks "Share on Farcaster" or "Skip"

---

## Screens

### Home (`/`)
**Components:**
- TopNav (logo, hamburger menu)
- WelcomeBanner (dismissible)
- PrizeBanner (prize pool, countdown, week)
- Tabs (MiniApps | Hunters)
- Leaderboard (cards) - **Real data from contracts**
- FAB (+ button, apps tab only)

**Apps Tab:**
- Cards: rank badge, avatar, name, description, vote button
- Vote button highlights if user has bet
- Data: Live from smart contracts

**Hunters Tab:**
- Cards: rank, avatar, username, apps/bets counts, estimated earnings
- Data: Live from smart contracts

### My Bets (`/my-bets`)
**Components:**
- TopNav
- Current Week Section - **Real data from contracts**
  - Card with bets list + totals
- Past Weeks Section - **Mock data (3 weeks)**
  - Accordion, expandable
  - Week 47: Unclaimed ($124.50)
  - Week 46: Lost ($0)
  - Week 45: Claimed ($87.20)

**Week States:**
- `active` - Current week (real data)
- `unclaimed` - Claimable winnings, claim button (mock)
- `claimed` - Already claimed, shows date (mock)
- `lost` - No winnings (mock)

### Modals (All use ModalWrapper)

**BettingModal:**
- App avatar, name, description, URL
- Rank, total bets, your bets
- Voter avatars (social proof)
- Price + "Bet $X.XX" button (Hi-Viz)
- **Data: Real from contracts**

**SubmitAppModal:**
- URL input
- Auto-fetched preview (icon, name, description)
- Validation status (✓ valid, ✓ not submitted)
- "Submit for $1.00" button (Hi-Viz)

**ClaimModal:**
- Week identifier (mock week data)
- Winning apps + your share
- Total claimable + deadline
- "Claim $X.XX" button (Hi-Viz)
- **For mock weeks only - show success message without real transaction**

**ShareModal:**
- Success icon + "Bet Confirmed!"
- Your bets + total spent
- Cast preview
- "Share on Farcaster" button (secondary)
- "Skip" button

**HowItWorksModal:**
- 3-step explainer
- Video placeholder
- Example scenarios (expandable)
- FAQ accordion

### Navigation
**Hamburger Menu:**
- Home
- My Bets
- Submit MiniApp
- How It Works
- Theme (shows: Dark)

---

## Mock Data Structure

**Past Week 1 (Week 47, Nov 15-21) - Unclaimed:**
```typescript
{
  id: "w47",
  label: "Week 47 (Nov 15 - Nov 21)",
  status: "unclaimed",
  winnings: 124.50,
  claimDeadline: "Feb 12, 2026",
  daysLeft: 82,
  items: [
    { 
      appName: "TaskMaster Pro", 
      votes: 8, 
      spent: 12.00, 
      winnings: 124.50, 
      rank: 1 
    }
  ]
}
```

**Past Week 2 (Week 46, Nov 8-14) - Lost:**
```typescript
{
  id: "w46",
  label: "Week 46 (Nov 8 - Nov 14)",
  status: "lost",
  items: [
    { 
      appName: "MemeGen", 
      votes: 2, 
      spent: 2.10, 
      winnings: 0, 
      rank: 8 
    }
  ]
}
```

**Past Week 3 (Week 45, Nov 1-7) - Claimed:**
```typescript
{
  id: "w45",
  label: "Week 45 (Nov 1 - Nov 7)",
  status: "claimed",
  winnings: 87.20,
  claimDeadline: "Nov 18, 2025",
  items: [
    { 
      appName: "DeFi Tracker", 
      votes: 5, 
      spent: 6.00, 
      winnings: 87.20, 
      rank: 2 
    }
  ]
}
```

---

## State Management (Keep from v0)

**Modal Management:**
```typescript
const [modalOpen, setModalOpen] = useState<string | null>(null)
const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
```

**Tab Switching:**
```typescript
const [activeTab, setActiveTab] = useState<"apps" | "hunters">("apps")
```

**Accordion:**
```typescript
const [expandedWeek, setExpandedWeek] = useState<string | null>("w47")  // First past week open by default
```

---

## Component Patterns

**App Card:**
```
[Rank Badge] [Avatar] [Name/Description] [Vote Button]
- Height: 72px
- Vote button: Shows count, highlights if user voted
```

**Hunter Card:**
```
[Rank] [Avatar] [Username/Stats] [Earnings]
- Height: 72px
- Stats: "5 apps • 47 bets"
- Earnings: Right-aligned, prominent
```

**Prize Banner:**
```
Title: "Bet on the best miniapp of the week"
Label: "🏆 WEEK 48 PRIZE POOL"
Amount: "$12,847" (Geist Mono Semibold, largest)
Countdown: "⏱ Ends in: 6d 14h 22m" (Geist Mono)
```

---

## Key Interactions

**Vote Button:**
- Default: Arrow up icon + count
- Hover: Scale 1.05
- Active: Scale 0.95
- User voted: Highlighted background

**FAB (Floating Action Button):**
- Shows only on apps tab
- Opens submit modal
- Hi-Viz yellow, bottom-right

**Dismissible Banner:**
- X button closes
- localStorage persistence
- Shows once per user

**Accordion Weeks:**
- Click to expand/collapse
- Chevron rotates on expand
- Shows summary when collapsed (e.g., "Claim $124.50")
- Full details when expanded

**Mock Week Claims:**
- Clicking "Claim" on mock weeks shows success without real transaction
- Add note: "Demo claim - connect wallet for real claims"

---

## Mobile Specs
- Viewport: 424px × 695px
- Tap targets: 44px minimum
- Fixed: TopNav (top), Tabs (sticky after prize banner), FAB (bottom-right)
- Scrollable: Leaderboards, My Bets content

---

*Reference: DESIGN_SYSTEM.md for colors/fonts, COMPONENTS.md for file structure*
