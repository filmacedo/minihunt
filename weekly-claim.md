## Weekly claim

We need to add a way to implement for users to claim the missing amounts from latest weeks.

### Implementation

1. **Week Navigation in Header (PrizeBanner)**
   - Add left and right arrow buttons in the PrizeBanner component
   - Allow users to navigate through all past weeks
   - Show all weeks but highlight those where the user has rewards
   - Use week index directly (0, 1, 2, ...) from the contract

2. **Unclaimed Weeks List in "My Bets" Page**
   - Add claim buttons to each past week card in the existing list
   - Show claim button only for weeks where user has rewards
   - Display weeks that are finalized and within the 90-day claim window

3. **Claim Button Implementation**
   - Call the smart contract `claim(uint256 weekIdx)` method
   - Use the same wagmi pattern as the betting modal
   - Show loading state during transaction
   - Refresh data after successful claim
   - Show error message if claim fails

4. **Claim Status & Deadline**
   - Check claim status in the database (not from contract)
   - Calculate 90-day deadline on frontend: `week.endTime + 90 days`
   - Show countdown timer for weeks approaching deadline
   - Disable button after deadline expires

5. **Button States**
   - **Enabled**: Week finalized, has rewards, within 90 days, not yet claimed
   - **Disabled (Claimed)**: Already claimed - show amount claimed and date, disable button
   - **Disabled (Expired)**: Past 90-day deadline - show "Claim expired" message
   - **Disabled (Not Finalized)**: Week not finalized yet

6. **Multiple Weeks**
   - Users claim each week individually (no batch claiming)

### Technical Notes
- No contract changes required
- Use week index (uint256) directly for contract calls
- Track claim status in database
- Calculate deadline on frontend using `week.endTime + 90 days`