# MiniHunt - Component Inventory

## File Structure (from v0)
```
/app
  /page.tsx                  # Home (apps + hunters leaderboard)
  /my-bets/page.tsx          # Portfolio + claims
  /layout.tsx                # Root layout
  /globals.css               # Global styles

/components
  /top-nav.tsx               # Nav bar with hamburger
  /prize-banner.tsx          # Prize pool header
  /welcome-banner.tsx        # Dismissible banner
  /modals
    /modal-wrapper.tsx       # Base modal
    /betting-modal.tsx       # Bet on app
    /submit-app-modal.tsx    # Submit new app
    /claim-modal.tsx         # Claim rewards
    /share-modal.tsx         # Share after action
    /how-it-works-modal.tsx  # Info modal
  /ui                        # shadcn/ui components
    /avatar.tsx
    /button.tsx
    /dialog.tsx
    /sheet.tsx
    /accordion.tsx
    /icons.tsx
    /separator.tsx

/lib
  /data.ts                   # Mock data + interfaces
  /utils.ts                  # Utilities (cn, etc)
```

## Data Sources

**Current Week (Week 48 - Nov 22-28):**
- Real data from smart contracts
- Apps leaderboard
- Hunters leaderboard  
- User's active bets

**Past 3 Weeks (Mock Data):**
- Week 47 (Nov 15-21) - Unclaimed: $124.50
- Week 46 (Nov 8-14) - Lost: $0
- Week 45 (Nov 1-7) - Claimed: $87.20

See PRODUCT.md for mock data structure.

## Key State Patterns (keep from v0)

```typescript
// Modal management
const [modalOpen, setModalOpen] = useState<string | null>(null)
const [selectedAppId, setSelectedAppId] = useState<string | null>(null)

// Tab switching
const [activeTab, setActiveTab] = useState<"apps" | "hunters">("apps")

// Accordion (first past week open by default)
const [expandedWeek, setExpandedWeek] = useState<string | null>("w47")
```

## shadcn/ui Components Used
- Avatar, AvatarImage, AvatarFallback
- Button
- Dialog, DialogContent, DialogHeader, DialogTitle
- Sheet, SheetContent, SheetHeader, SheetTitle
- Accordion, AccordionItem, AccordionTrigger, AccordionContent
- Separator
- Icons (custom icon component)

## Transaction Handlers

**Bet on App:**
- Call contract `vote(appId)` with value
- Show loading state
- On success → open share modal
- On error → show error toast

**Submit App:**
- Call contract `submitApp(urlHash)` with $1 value
- Show loading state
- On success → app appears in leaderboard
- On error → show error message

**Claim Rewards (Mock Only):**
- For mock weeks (47, 46, 45): Show success message without real transaction
- Add note: "Demo claim - past weeks are for demonstration"
- Future: Real claims will call contract `claimRewards()`

## Farcaster SDK Integration

**Required:**
- Initialize in layout: `sdk.actions.ready()`
- Get user context: `sdk.context` (FID, username, avatar)
- Share function: `sdk.actions.openUrl()` with Warpcast composer

**Usage Points:**
- Share modal: Opens Farcaster cast composer
- User avatar: Display from Farcaster profile
- Auto sign-in: User already authenticated via Farcaster
