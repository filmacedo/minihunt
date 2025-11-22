# Cursor Migration Prompt

You are migrating a v0 prototype into a Farcaster mini-app template.

**Attached:**
- Screenshots showing final UI
- `PRODUCT.md`, `DESIGN_SYSTEM.md`, `COMPONENTS.md`

**v0 Codebase:**
The complete v0 code is too large to attach. Start by asking me to share these essential files from the v0 project:
1. `/lib/data.ts` - Mock data structures & interfaces
2. `/components/top-nav.tsx` - Navigation bar
3. `/components/modals/betting-modal.tsx` - Example modal pattern
4. `/app/page.tsx` - Home page structure
5. `/app/my-bets/page.tsx` - My Bets page structure

As you work, request additional component files as needed.

## Task
Import v0 components into the current project. Use real data from smart contracts for current week, and mock data for past 3 weeks.

## What to Import
Copy entire folders:
- `/components` (all files including modals and ui)
- `/app/page.tsx` and `/app/my-bets/page.tsx`
- `/app/globals.css`
- `/lib/data.ts` (contains mock data + interfaces)
- `/lib/utils.ts`

## Data Strategy

**Current Week (Week 48 - Nov 22-28):**
- Fetch from smart contracts
- Apps leaderboard with live vote counts
- Hunters leaderboard with live earnings
- User's active bets

**Past 3 Weeks (Mock Data in `/lib/data.ts`):**
- Week 47 (Nov 15-21) - Unclaimed: $124.50, TaskMaster Pro #1
- Week 46 (Nov 8-14) - Lost: $0, MemeGen #8
- Week 45 (Nov 1-7) - Claimed: $87.20, DeFi Tracker #2

Keep mock data in `/lib/data.ts` for past weeks display.

## What to Adapt

### 1. Update Mock Data References
In `/app/my-bets/page.tsx`:
- Keep `PAST_WEEKS` import for mock data
- Replace `CURRENT_WEEK_BETS` with real contract data

In `/app/page.tsx`:
- Replace `MOCK_APPS` with real contract reads
- Replace `MOCK_HUNTERS` with real contract reads

### 2. Connect Smart Contracts
Use template's existing wallet/contract setup:

**Read Functions:**
- Get current week apps: `getApps(weekId)`
- Get hunters leaderboard: Calculate from contract events
- Get user bets: `getUserBets(address, weekId)`

**Write Functions:**
- Betting modal: `vote(appId)` with value
- Submit modal: `submitApp(urlHash)` with $1 value
- Claim modal: Mock only (show success without transaction)

### 3. Add Farcaster SDK
- Initialize `@farcaster/miniapp-sdk` in layout
- Call `sdk.actions.ready()` when app loads
- Get user context: `sdk.context` for FID, username, avatar
- Implement share: `sdk.actions.openUrl()` in share modal

### 4. Keep v0 Patterns
- Modal state management (string-based)
- Tab switching logic
- Accordion expand/collapse (w47 open by default)
- All styling and component structure

### 5. Mock Week Claims
For past weeks (w47, w46, w45):
- Show success message without real transaction
- Add note: "Demo claim - past weeks are for demonstration"

## Design System
Reference `DESIGN_SYSTEM.md` for:
- Colors (Hi-Viz yellow only for Bet/Claim buttons)
- Fonts (Geist for text, Geist Mono for numbers)
- Component specs (72px cards, 44px tap targets)

## Create Your Migration Plan
1. Assess current template structure
2. Identify conflicts with v0 components
3. Plan component integration order
4. Separate mock data (past weeks) from real data (current week)
5. Execute migration systematically

Start by analyzing the current project structure and v0 codebase, then propose a migration plan.