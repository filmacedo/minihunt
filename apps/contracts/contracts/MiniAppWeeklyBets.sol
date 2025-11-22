// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  MiniAppWeeklyBets
  - Celo / cUSD ERC20 used for payments (constructor arg)
  - Weeks are anchored by `startTime` (should be Monday 00:00 UTC epoch)
  - Voting is only allowed on `currentWeek`. After finalization, currentWeek increments.
  - Finalization can be called by admin or automatically by first claimer (if end time reached).
  - Prices & votes reset per week. Apps persist across weeks (registry).
  - Payouts to voters proportionally to votes on winning apps.
*/
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MiniAppWeeklyBets is Ownable {
    using SafeERC20 for IERC20;

    /* ========== CONSTANTS ========== */
    uint256 public constant WEEK_SECONDS = 7 days;
    uint256 public constant PRICE_NUM = 103;      // 3% growth multiplier numerator
    uint256 public constant PRICE_DEN = 100;      // denominator
    uint256 public constant PROTOCOL_FEE_NUM = 10; // 10%
    uint256 public constant PROTOCOL_FEE_DEN = 100;
    uint256 public constant CLAIM_DEADLINE = 90 days;

    /* ========== IMMUTABLES ========== */
    IERC20 public immutable cUSD;
    uint256 public immutable startTime; // unix timestamp of week 0 start (Mon 00:00 UTC recommended)

    /* ========== STATE ========== */
    address public protocolRecipient;
    uint256 public currentWeek; // active week for voting
    uint256 public totalPrizePools; // cumulative total of all prize pools ever stored (never decreases)
    uint256 public initialPrice; // initial price for voting (updatable by owner, no decimals assumption)

    // global registry of apps (persist across weeks)
    mapping(bytes32 => bool) public appRegistered;

    // per-week data
    struct AppWeekInfo {
        uint256 votes;
        uint256 price; // price for next vote inside this week (0 means not initialized -> treat as initialPrice)
        bool existsInWeek;
    }

    // Flattened struct fields (cannot use struct in mapping due to Hardhat 3 limitation)
    mapping(uint256 => uint256) internal weekPrizePool; // weekIdx => prize pool
    mapping(uint256 => uint256) internal weekTotalPrizePool; // weekIdx => cumulative total prize pool ever stored for this week (never decreases)
    mapping(uint256 => uint256) internal weekProtocolCollected; // weekIdx => protocol collected
    mapping(uint256 => bool) internal weekFinalized; // weekIdx => finalized
    mapping(uint256 => uint256) internal weekFirstVotes; // weekIdx => first place votes
    mapping(uint256 => uint256) internal weekSecondVotes; // weekIdx => second place votes
    mapping(uint256 => uint256) internal weekThirdVotes; // weekIdx => third place votes
    
    // Flattened mappings and arrays (cannot be in struct)
    mapping(uint256 => bytes32[]) internal weekApps; // weekIdx => app hashes
    mapping(uint256 => bytes32[]) internal weekFirstGroup; // weekIdx => first place apps
    mapping(uint256 => bytes32[]) internal weekSecondGroup; // weekIdx => second place apps
    mapping(uint256 => bytes32[]) internal weekThirdGroup; // weekIdx => third place apps
    mapping(uint256 => mapping(bytes32 => AppWeekInfo)) internal weekAppInfo; // weekIdx => appHash => AppWeekInfo
    mapping(uint256 => mapping(bytes32 => mapping(address => uint256))) internal weekVotesByUser; // weekIdx => appHash => user => votes
    mapping(uint256 => mapping(address => uint256)) internal weekUserTotalVotes; // weekIdx => user => total votes
    mapping(uint256 => mapping(address => bool)) internal weekClaimed; // weekIdx => user => claimed

    /* ========== EVENTS ========== */
    event AppSubmitted(bytes32 indexed appHash, string fullUrl, address indexed submitter, uint256 week);
    event Voted(bytes32 indexed appHash, address indexed voter, uint256 pricePaid, uint256 week);
    event WeekFinalized(uint256 indexed week, bytes32[] firstGroup, bytes32[] secondGroup, bytes32[] thirdGroup);
    event Claimed(uint256 indexed week, address indexed claimer, uint256 amount);
    event SweepToProtocol(uint256 indexed week, uint256 amount);
    event ProtocolRecipientChanged(address indexed newRecipient);
    event InitialPriceChanged(uint256 oldPrice, uint256 newPrice);

    /* ========== ERRORS ========== */
    error NotEnoughPayment();
    error VotingClosedForWeek();
    error WeekNotFinalized();
    error AlreadyClaimed();
    error NotEligibleToClaim();
    error NothingToSweep();
    error InvalidFinalizeTime();

    /* ========== CONSTRUCTOR ========== */
    constructor(
        address _cUSD,
        address _protocolRecipient,
        uint256 _startTime,
        uint256 _initialPrice
    ) Ownable(msg.sender) {
        require(_cUSD != address(0), "cUSD zero");
        require(_protocolRecipient != address(0), "protocol zero");
        require(_startTime > 0, "startTime zero");
        require(_initialPrice > 0, "initialPrice zero");

        cUSD = IERC20(_cUSD);
        protocolRecipient = _protocolRecipient;
        startTime = _startTime;
        initialPrice = _initialPrice;
        // set currentWeek to the week corresponding to now (allows immediate voting)
        currentWeek = getWeekIndex(block.timestamp);
    }

    /* ========== ADMIN ========== */
    function setProtocolRecipient(address _recipient) external onlyOwner {
        require(_recipient != address(0), "zero");
        protocolRecipient = _recipient;
        emit ProtocolRecipientChanged(_recipient);
    }

    /**
     * @notice Update the initial price for voting. Can be called by owner.
     * @param _newPrice The new initial price (in token's native units, no decimals assumption)
     */
    function setInitialPrice(uint256 _newPrice) external onlyOwner {
        require(_newPrice > 0, "price zero");
        uint256 oldPrice = initialPrice;
        initialPrice = _newPrice;
        emit InitialPriceChanged(oldPrice, _newPrice);
    }

    /* ========== VOTING ========== */
    /**
     * @notice Vote for (or create + vote) an app for the active currentWeek.
     * @param appHash keccak256(normalizedUrl)
     * @param fullUrl normalized full URL (emitted in event for off-chain indexing)
     */
    function vote(bytes32 appHash, string calldata fullUrl) external {
        if (weekFinalized[currentWeek]) revert VotingClosedForWeek();

        // initialize per-app-week info if needed
        AppWeekInfo storage ai = weekAppInfo[currentWeek][appHash];
        bool newAppThisWeek = false;
        if (!ai.existsInWeek) {
            ai.existsInWeek = true;
            ai.price = initialPrice;
            weekApps[currentWeek].push(appHash);
            newAppThisWeek = true;
        }

        uint256 cost = ai.price == 0 ? initialPrice : ai.price;

        // transfer cUSD from user (user must approve first)
        cUSD.safeTransferFrom(msg.sender, address(this), cost);

        // compute fees
        uint256 protocolFee = (cost * PROTOCOL_FEE_NUM) / PROTOCOL_FEE_DEN;
        uint256 poolShare = cost - protocolFee;

        weekProtocolCollected[currentWeek] += protocolFee;
        weekPrizePool[currentWeek] += poolShare;
        weekTotalPrizePool[currentWeek] += poolShare;
        totalPrizePools += poolShare;

        // mark app as registered globally (persist)
        if (!appRegistered[appHash]) {
            appRegistered[appHash] = true;
            emit AppSubmitted(appHash, fullUrl, msg.sender, currentWeek);
        } else if (newAppThisWeek) {
            // app persisted but first time in this week; still emit submitted event for week indexing
            emit AppSubmitted(appHash, fullUrl, msg.sender, currentWeek);
        }

        // increment votes & update price for next vote
        ai.votes += 1;
        // price growth: multiply by 103/100
        ai.price = ((ai.price == 0 ? initialPrice : ai.price) * PRICE_NUM) / PRICE_DEN;

        // record per-user votes
        weekVotesByUser[currentWeek][appHash][msg.sender] += 1;
        weekUserTotalVotes[currentWeek][msg.sender] += 1;

        emit Voted(appHash, msg.sender, cost, currentWeek);
    }

    /* ========== FINALIZATION ========== */
    /**
     * @notice Finalize the active currentWeek. Can be called by owner/admin or by claimant (auto-finalize path).
     * Requirements: current timestamp must be >= official end of the week (startTime + (currentWeek+1)*WEEK_SECONDS)
     */
    function finalizeCurrentWeek() public {
        if (weekFinalized[currentWeek]) return; // idempotent

        uint256 weekEnd = startTime + (currentWeek + 1) * WEEK_SECONDS;
        if (block.timestamp < weekEnd) revert InvalidFinalizeTime();

        // determine top-3 groups and store winners on-chain
        _computeWinnersAndStore(currentWeek);

        weekFinalized[currentWeek] = true;

        emit WeekFinalized(currentWeek, weekFirstGroup[currentWeek], weekSecondGroup[currentWeek], weekThirdGroup[currentWeek]);

        // advance currentWeek to unlock next week for voting
        currentWeek += 1;
    }

    // Internal function used by claim path to auto-finalize if needed
    function _maybeAutoFinalize(uint256 weekIdx) internal {
        if (!weekFinalized[weekIdx]) {
            // only finalize if weekIdx == currentWeek and end time reached
            require(weekIdx == currentWeek, "can only auto-finalize active week");
            uint256 weekEnd = startTime + (currentWeek + 1) * WEEK_SECONDS;
            if (block.timestamp >= weekEnd) {
                finalizeCurrentWeek();
            } else {
                revert InvalidFinalizeTime();
            }
        }
    }

    // compute winners by iterating apps of a week (called once during finalize)
    function _computeWinnersAndStore(uint256 weekIdx) internal {
        bytes32[] storage apps = weekApps[weekIdx];
        uint256 n = apps.length;
        if (n == 0) {
            // nothing to do
            return;
        }

        // find top 3 distinct vote counts
        uint256 max1 = 0;
        uint256 max2 = 0;
        uint256 max3 = 0;

        for (uint256 i = 0; i < n; i++) {
            bytes32 app = apps[i];
            uint256 v = weekAppInfo[weekIdx][app].votes;
            if (v > max1) {
                max3 = max2;
                max2 = max1;
                max1 = v;
            } else if (v > max2 && v < max1) {
                max3 = max2;
                max2 = v;
            } else if (v > max3 && v < max2) {
                max3 = v;
            }
        }

        weekFirstVotes[weekIdx] = max1;
        weekSecondVotes[weekIdx] = max2;
        weekThirdVotes[weekIdx] = max3;

        // collect groups
        for (uint256 i = 0; i < n; i++) {
            bytes32 app = apps[i];
            uint256 v = weekAppInfo[weekIdx][app].votes;
            if (v == max1) weekFirstGroup[weekIdx].push(app);
            else if (v == max2) weekSecondGroup[weekIdx].push(app);
            else if (v == max3) weekThirdGroup[weekIdx].push(app);
        }
    }

    /* ========== CLAIMING ========== */
    /**
     * @notice Claim rewards for a finalized week. Caller must have voted that week.
     * @param weekIdx any timestamp-based week index the caller wants to claim (use actual week index)
     */
    function claim(uint256 weekIdx) external {
        // If weekIdx equals the active currentWeek and not finalized yet, allow first claimer to finalize (auto-finalize)
        if (!weekFinalized[weekIdx]) {
            // only allow auto-finalize if this is the active week
            _maybeAutoFinalize(weekIdx);
        }

        if (!weekFinalized[weekIdx]) revert WeekNotFinalized();
        if (weekUserTotalVotes[weekIdx][msg.sender] == 0) revert NotEligibleToClaim();
        if (weekClaimed[weekIdx][msg.sender]) revert AlreadyClaimed();

        // compute payout for caller using stored winners and rules
        uint256 payout = _computePayoutForUser(weekIdx, msg.sender);

        // mark claimed before transfer
        weekClaimed[weekIdx][msg.sender] = true;

        if (payout > 0) {
            // decrement prizePool and transfer
            uint256 pool = weekPrizePool[weekIdx];
            if (payout > pool) {
                // rounding safety: cap
                payout = pool;
            }
            weekPrizePool[weekIdx] = pool - payout;
            cUSD.safeTransfer(msg.sender, payout);
        }

        emit Claimed(weekIdx, msg.sender, payout);
    }

    // Helper: calculate payout from a group of apps with a given percentage
    function _calculateGroupPayout(
        uint256 weekIdx,
        address user,
        bytes32[] storage group,
        uint256 pool,
        uint256 totalPct
    ) internal view returns (uint256) {
        if (group.length == 0) return 0;
        uint256 perAppPct = totalPct / group.length;
        uint256 payout = 0;
        for (uint256 i = 0; i < group.length; i++) {
            bytes32 app = group[i];
            uint256 appVotes = weekAppInfo[weekIdx][app].votes;
            if (appVotes == 0) continue;
            uint256 userVotes = weekVotesByUser[weekIdx][app][user];
            if (userVotes == 0) continue;
            uint256 appBucket = (pool * perAppPct) / 100;
            payout += (userVotes * appBucket) / appVotes;
        }
        return payout;
    }

    // Helper: calculate payout for single app
    function _calculateSingleAppPayout(
        uint256 weekIdx,
        address user,
        bytes32 app,
        uint256 pool,
        uint256 pct,
        uint256 appVotes
    ) internal view returns (uint256) {
        uint256 userVotes = weekVotesByUser[weekIdx][app][user];
        if (userVotes == 0 || appVotes == 0) return 0;
        uint256 appBucket = (pool * pct) / 100;
        return (userVotes * appBucket) / appVotes;
    }

    // Helper: calculate payout from a group of apps (memory version for on-the-fly computation)
    function _calculateGroupPayoutMemory(
        uint256 weekIdx,
        address user,
        bytes32[] memory group,
        uint256 pool,
        uint256 totalPct
    ) internal view returns (uint256) {
        if (group.length == 0) return 0;
        uint256 perAppPct = totalPct / group.length;
        uint256 payout = 0;
        for (uint256 i = 0; i < group.length; i++) {
            bytes32 app = group[i];
            uint256 appVotes = weekAppInfo[weekIdx][app].votes;
            if (appVotes == 0) continue;
            uint256 userVotes = weekVotesByUser[weekIdx][app][user];
            if (userVotes == 0) continue;
            uint256 appBucket = (pool * perAppPct) / 100;
            payout += (userVotes * appBucket) / appVotes;
        }
        return payout;
    }

    // Helper to get votes for an app
    function _getAppVotes(uint256 weekIdx, bytes32 app) internal view returns (uint256) {
        return weekAppInfo[weekIdx][app].votes;
    }

    // Find top 3 vote counts
    function _findTop3(uint256 weekIdx, bytes32[] memory apps) internal view returns (uint256 max1, uint256 max2, uint256 max3) {
        max1 = 0;
        max2 = 0;
        max3 = 0;
        uint256 n = apps.length;
        
        for (uint256 i = 0; i < n; i++) {
            uint256 v = _getAppVotes(weekIdx, apps[i]);
            if (v == 0) continue; // Skip apps with no votes
            
            if (v > max1) {
                max3 = max2;
                max2 = max1;
                max1 = v;
            } else if (v < max1 && v > max2) {
                max3 = max2;
                max2 = v;
            } else if (v < max2 && v > max3) {
                max3 = v;
            }
        }
    }

    // Count groups
    function _countGroups(uint256 weekIdx, bytes32[] memory apps, uint256 max1, uint256 max2, uint256 max3) internal view returns (uint256 cnt1, uint256 cnt2, uint256 cnt3) {
        cnt1 = 0;
        cnt2 = 0;
        cnt3 = 0;
        uint256 n = apps.length;
        
        for (uint256 i = 0; i < n; i++) {
            uint256 v = _getAppVotes(weekIdx, apps[i]);
            if (v == 0) continue; // Skip apps with no votes
            
            if (v == max1) {
                cnt1++;
            } else if (v == max2) {
                cnt2++;
            } else if (v == max3) {
                cnt3++;
            }
        }
    }

    // Populate groups
    function _populateGroups(uint256 weekIdx, bytes32[] memory apps, uint256 max1, uint256 max2, uint256 max3, bytes32[] memory firstGroup, bytes32[] memory secondGroup, bytes32[] memory thirdGroup) internal view {
        uint256 idx1 = 0;
        uint256 idx2 = 0;
        uint256 idx3 = 0;
        uint256 n = apps.length;

        for (uint256 i = 0; i < n; i++) {
            bytes32 app = apps[i];
            uint256 v = _getAppVotes(weekIdx, app);
            if (v == 0) continue; // Skip apps with no votes
            
            if (v == max1) {
                firstGroup[idx1++] = app;
            } else if (v == max2) {
                secondGroup[idx2++] = app;
            } else if (v == max3) {
                thirdGroup[idx3++] = app;
            }
        }
    }

    // Compute winners on the fly (view function for non-finalized weeks)
    function _computeWinnersView(uint256 weekIdx) internal view returns (
        bytes32[] memory firstGroup,
        bytes32[] memory secondGroup,
        bytes32[] memory thirdGroup,
        uint256 firstVotes,
        uint256 secondVotes,
        uint256 thirdVotes
    ) {
        bytes32[] memory apps = weekApps[weekIdx];
        if (apps.length == 0) {
            return (firstGroup, secondGroup, thirdGroup, 0, 0, 0);
        }

        // Find top 3
        (firstVotes, secondVotes, thirdVotes) = _findTop3(weekIdx, apps);

        // Count groups
        (uint256 cnt1, uint256 cnt2, uint256 cnt3) = _countGroups(weekIdx, apps, firstVotes, secondVotes, thirdVotes);

        // Allocate arrays
        firstGroup = new bytes32[](cnt1);
        secondGroup = new bytes32[](cnt2);
        thirdGroup = new bytes32[](cnt3);

        // Populate groups
        _populateGroups(weekIdx, apps, firstVotes, secondVotes, thirdVotes, firstGroup, secondGroup, thirdGroup);
    }

    // Compute payout for user using computed winners (for non-finalized weeks)
    function _computePayoutForUserWithWinners(
        uint256 weekIdx,
        address user,
        bytes32[] memory firstGroup,
        bytes32[] memory secondGroup,
        bytes32[] memory thirdGroup,
        uint256 firstVotes,
        uint256 secondVotes,
        uint256 thirdVotes
    ) internal view returns (uint256) {
        uint256 pool = weekPrizePool[weekIdx];
        if (pool == 0) return 0;

        // If firstGroup size >=3 -> split 100% equally among firstGroup apps
        if (firstGroup.length >= 3) {
            return _calculateGroupPayoutMemory(weekIdx, user, firstGroup, pool, 100);
        }

        // If two tie for first -> they share 90% equally
        if (firstGroup.length == 2) {
            uint256 firstPayout = _calculateGroupPayoutMemory(weekIdx, user, firstGroup, pool, 90);
            // third handling (if present)
            if (thirdVotes > 0 && thirdGroup.length > 0) {
                firstPayout += _calculateGroupPayoutMemory(weekIdx, user, thirdGroup, pool, 10);
            }
            return firstPayout;
        }

        uint256 payout = 0;

        // Normal case: single firstGroup app (or empty)
        if (firstGroup.length == 1 && firstVotes > 0) {
            payout += _calculateSingleAppPayout(weekIdx, user, firstGroup[0], pool, 60, firstVotes);
        }

        // second group
        if (secondVotes > 0 && secondGroup.length > 0) {
            if (secondGroup.length > 1) {
                // tie for second => they share 40% (30+10)
                payout += _calculateGroupPayoutMemory(weekIdx, user, secondGroup, pool, 40);
            } else {
                // single second app => 30%
                payout += _calculateSingleAppPayout(weekIdx, user, secondGroup[0], pool, 30, secondVotes);
            }
        }

        // third group only if not already included
        if (thirdVotes > 0 && thirdGroup.length > 0 && firstGroup.length != 2) {
            payout += _calculateGroupPayoutMemory(weekIdx, user, thirdGroup, pool, 10);
        }

        return payout;
    }

    // compute user's payout given stored winners in week
    function _computePayoutForUser(uint256 weekIdx, address user) internal view returns (uint256) {
        uint256 pool = weekPrizePool[weekIdx];
        if (pool == 0) return 0;

        bytes32[] storage firstGroup = weekFirstGroup[weekIdx];
        bytes32[] storage secondGroup = weekSecondGroup[weekIdx];
        bytes32[] storage thirdGroup = weekThirdGroup[weekIdx];

        // If firstGroup size >=3 -> split 100% equally among firstGroup apps
        if (firstGroup.length >= 3) {
            return _calculateGroupPayout(weekIdx, user, firstGroup, pool, 100);
        }

        // If two tie for first -> they share 90% equally
        if (firstGroup.length == 2) {
            uint256 firstPayout = _calculateGroupPayout(weekIdx, user, firstGroup, pool, 90);
            // third handling (if present)
            if (weekThirdVotes[weekIdx] > 0 && thirdGroup.length > 0) {
                firstPayout += _calculateGroupPayout(weekIdx, user, thirdGroup, pool, 10);
            }
            return firstPayout;
        }

        uint256 payout = 0;

        // Normal case: single firstGroup app (or empty)
        if (firstGroup.length == 1 && weekFirstVotes[weekIdx] > 0) {
            payout += _calculateSingleAppPayout(weekIdx, user, firstGroup[0], pool, 60, weekFirstVotes[weekIdx]);
        }

        // second group
        if (weekSecondVotes[weekIdx] > 0 && secondGroup.length > 0) {
            if (secondGroup.length > 1) {
                // tie for second => they share 40% (30+10)
                payout += _calculateGroupPayout(weekIdx, user, secondGroup, pool, 40);
            } else {
                // single second app => 30%
                payout += _calculateSingleAppPayout(weekIdx, user, secondGroup[0], pool, 30, weekSecondVotes[weekIdx]);
            }
        }

        // third group only if not already included
        if (weekThirdVotes[weekIdx] > 0 && thirdGroup.length > 0 && firstGroup.length != 2) {
            payout += _calculateGroupPayout(weekIdx, user, thirdGroup, pool, 10);
        }

        return payout;
    }

    /* ========== SWEEP UNCLAIMED ========== */
    /**
     * @notice Sweep leftover prizePool + protocolCollected to protocol recipient after claim deadline.
     * Anyone can call after (weekEnd + CLAIM_DEADLINE)
     */
    function sweepUnclaimedToProtocol(uint256 weekIdx) external {
        uint256 weekEnd = startTime + (weekIdx + 1) * WEEK_SECONDS;
        require(block.timestamp >= weekEnd + CLAIM_DEADLINE, "deadline not reached");

        uint256 amount = weekPrizePool[weekIdx] + weekProtocolCollected[weekIdx];
        if (amount == 0) revert NothingToSweep();

        // zero out
        weekPrizePool[weekIdx] = 0;
        weekProtocolCollected[weekIdx] = 0;

        cUSD.safeTransfer(protocolRecipient, amount);

        emit SweepToProtocol(weekIdx, amount);
    }

    /* ========== VIEWS ========== */
    function getWeekIndex(uint256 timestamp) public view returns (uint256) {
        if (timestamp < startTime) return 0;
        return (timestamp - startTime) / WEEK_SECONDS;
    }

    // return the active voting week
    function getCurrentWeek() external view returns (uint256) {
        return currentWeek;
    }

    // get apps for a week
    function getAppsForWeek(uint256 weekIdx) external view returns (bytes32[] memory) {
        return weekApps[weekIdx];
    }

    // get votes for app in week
    function getVotesForAppInWeek(uint256 weekIdx, bytes32 appHash) external view returns (uint256) {
        return weekAppInfo[weekIdx][appHash].votes;
    }

    // get user's votes for app in week
    function getUserVotesForAppInWeek(uint256 weekIdx, bytes32 appHash, address user) external view returns (uint256) {
        return weekVotesByUser[weekIdx][appHash][user];
    }

    // get winners stored for week (empty arrays if not finalized)
    function getWinnersForWeek(uint256 weekIdx) external view returns (
        bytes32[] memory firstGroup,
        bytes32[] memory secondGroup,
        bytes32[] memory thirdGroup,
        uint256 firstVotes,
        uint256 secondVotes,
        uint256 thirdVotes
    ) {
        return (weekFirstGroup[weekIdx], weekSecondGroup[weekIdx], weekThirdGroup[weekIdx], weekFirstVotes[weekIdx], weekSecondVotes[weekIdx], weekThirdVotes[weekIdx]);
    }

    // View functions for testing
    function getWeekPrizePool(uint256 weekIdx) external view returns (uint256) {
        return weekPrizePool[weekIdx];
    }

    /**
     * @notice Get the cumulative total prize pool ever stored for a specific week (never decreases).
     * @param weekIdx The week index to check
     * @return The cumulative total amount in cUSD that was ever added to this week's prize pool
     */
    function getWeekTotalPrizePool(uint256 weekIdx) external view returns (uint256) {
        return weekTotalPrizePool[weekIdx];
    }

    function getWeekProtocolCollected(uint256 weekIdx) external view returns (uint256) {
        return weekProtocolCollected[weekIdx];
    }

    function isWeekFinalized(uint256 weekIdx) external view returns (bool) {
        return weekFinalized[weekIdx];
    }

    function getWeekUserTotalVotes(uint256 weekIdx, address user) external view returns (uint256) {
        return weekUserTotalVotes[weekIdx][user];
    }

    /**
     * @notice Get the payout amount a voter would receive for a specific week.
     * Works for both finalized and non-finalized weeks, showing current potential winnings.
     * @param weekIdx The week index to check
     * @param voter The address of the voter
     * @return The payout amount in cUSD (0 if voter didn't vote or not eligible)
     */
    // Helper to compute payout for non-finalized week
    function _computePayoutNonFinalized(uint256 weekIdx, address voter, uint256 max1, uint256 max2, uint256 max3) internal view returns (uint256) {
        bytes32[] memory apps = weekApps[weekIdx];
        uint256 pool = weekPrizePool[weekIdx];
        if (pool == 0) return 0;
        
        // Count groups
        uint256 cnt1 = 0;
        uint256 cnt2 = 0;
        uint256 cnt3 = 0;
        uint256 n = apps.length;
        for (uint256 i = 0; i < n; i++) {
            uint256 v = weekAppInfo[weekIdx][apps[i]].votes;
            if (v == max1) cnt1++;
            else if (v == max2) cnt2++;
            else if (v == max3) cnt3++;
        }
        
        // Compute payout - inline to reduce parameters
        uint256 payout = 0;
        
        if (cnt1 >= 3) {
            for (uint256 i = 0; i < n; i++) {
                if (weekAppInfo[weekIdx][apps[i]].votes == max1) {
                    uint256 userVotes = weekVotesByUser[weekIdx][apps[i]][voter];
                    if (userVotes > 0) {
                        payout += (userVotes * pool) / (cnt1 * max1);
                    }
                }
            }
        } else if (cnt1 == 2) {
            for (uint256 i = 0; i < n; i++) {
                bytes32 app = apps[i];
                uint256 v = weekAppInfo[weekIdx][app].votes;
                uint256 userVotes = weekVotesByUser[weekIdx][app][voter];
                if (userVotes == 0) continue;
                if (v == max1) {
                    payout += (userVotes * pool * 90) / (200 * max1);
                } else if (v == max3 && cnt3 > 0) {
                    payout += (userVotes * pool * 10) / (100 * cnt3 * max3);
                }
            }
        } else {
            for (uint256 i = 0; i < n; i++) {
                bytes32 app = apps[i];
                uint256 v = weekAppInfo[weekIdx][app].votes;
                uint256 userVotes = weekVotesByUser[weekIdx][app][voter];
                if (userVotes == 0) continue;
                
                if (v == max1 && cnt1 == 1) {
                    payout += (userVotes * pool * 60) / (100 * max1);
                } else if (v == max2) {
                    if (cnt2 > 1) {
                        payout += (userVotes * pool * 40) / (100 * cnt2 * max2);
                    } else {
                        payout += (userVotes * pool * 30) / (100 * max2);
                    }
                } else if (v == max3 && cnt1 != 2) {
                    payout += (userVotes * pool * 10) / (100 * cnt3 * max3);
                }
            }
        }
        return payout;
    }

    /**
     * @notice Get the payout amount a voter would receive for a specific week.
     * Works for both finalized and non-finalized weeks, showing current potential winnings.
     * @param weekIdx The week index to check
     * @param voter The address of the voter
     * @return The payout amount in cUSD (0 if voter didn't vote or not eligible)
     */
    function getUserPayoutForWeek(uint256 weekIdx, address voter) external view returns (uint256) {
        if (weekUserTotalVotes[weekIdx][voter] == 0) {
            return 0;
        }
        
        if (weekFinalized[weekIdx]) {
            return _computePayoutForUser(weekIdx, voter);
        }
        
        // If week is not finalized, compute winners on the fly
        (
            bytes32[] memory firstGroup,
            bytes32[] memory secondGroup,
            bytes32[] memory thirdGroup,
            uint256 firstVotes,
            uint256 secondVotes,
            uint256 thirdVotes
        ) = _computeWinnersView(weekIdx);
        
        return _computePayoutForUserWithWinners(
            weekIdx,
            voter,
            firstGroup,
            secondGroup,
            thirdGroup,
            firstVotes,
            secondVotes,
            thirdVotes
        );
    }
}

