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
    uint256 public constant INITIAL_PRICE = 1e18; // 1 cUSD (18 decimals)
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

    // global registry of apps (persist across weeks)
    mapping(bytes32 => bool) public appRegistered;

    // per-week data
    struct AppWeekInfo {
        uint256 votes;
        uint256 price; // price for next vote inside this week (0 means not initialized -> treat as INITIAL_PRICE)
        bool existsInWeek;
    }

    // Flattened struct fields (cannot use struct in mapping due to Hardhat 3 limitation)
    mapping(uint256 => uint256) internal weekPrizePool; // weekIdx => prize pool
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
        uint256 _startTime
    ) Ownable(msg.sender) {
        require(_cUSD != address(0), "cUSD zero");
        require(_protocolRecipient != address(0), "protocol zero");
        require(_startTime > 0, "startTime zero");

        cUSD = IERC20(_cUSD);
        protocolRecipient = _protocolRecipient;
        startTime = _startTime;
        // set currentWeek to the week corresponding to now (allows immediate voting)
        currentWeek = getWeekIndex(block.timestamp);
    }

    /* ========== ADMIN ========== */
    function setProtocolRecipient(address _recipient) external onlyOwner {
        require(_recipient != address(0), "zero");
        protocolRecipient = _recipient;
        emit ProtocolRecipientChanged(_recipient);
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
            ai.price = INITIAL_PRICE;
            weekApps[currentWeek].push(appHash);
            newAppThisWeek = true;
        }

        uint256 cost = ai.price == 0 ? INITIAL_PRICE : ai.price;

        // transfer cUSD from user (user must approve first)
        cUSD.safeTransferFrom(msg.sender, address(this), cost);

        // compute fees
        uint256 protocolFee = (cost * PROTOCOL_FEE_NUM) / PROTOCOL_FEE_DEN;
        uint256 poolShare = cost - protocolFee;

        weekProtocolCollected[currentWeek] += protocolFee;
        weekPrizePool[currentWeek] += poolShare;

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
        ai.price = ((ai.price == 0 ? INITIAL_PRICE : ai.price) * PRICE_NUM) / PRICE_DEN;

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

    // compute user's payout given stored winners in week
    function _computePayoutForUser(uint256 weekIdx, address user) internal view returns (uint256) {
        uint256 pool = weekPrizePool[weekIdx];
        if (pool == 0) return 0;

        uint256 pctFirst = 60;
        uint256 pctSecond = 30;
        uint256 pctThird = 10;

        uint256 payout = 0;
        bytes32[] storage firstGroup = weekFirstGroup[weekIdx];
        bytes32[] storage secondGroup = weekSecondGroup[weekIdx];
        bytes32[] storage thirdGroup = weekThirdGroup[weekIdx];

        // If firstGroup size >=3 -> split 100% equally among firstGroup apps
        if (firstGroup.length >= 3) {
            uint256 eachPct = 100 / firstGroup.length;
            for (uint256 i = 0; i < firstGroup.length; i++) {
                bytes32 app = firstGroup[i];
                uint256 appVotes = weekAppInfo[weekIdx][app].votes;
                if (appVotes == 0) continue;
                uint256 uv = weekVotesByUser[weekIdx][app][user];
                if (uv == 0) continue;
                uint256 appBucket = (pool * eachPct) / 100;
                payout += (uv * appBucket) / appVotes;
            }
            return payout;
        }

        // If two tie for first -> they share 90% equally
        if (firstGroup.length == 2) {
            uint256 combinedPct = pctFirst + pctSecond; // 90
            uint256 eachPct = combinedPct / 2;
            for (uint256 i = 0; i < firstGroup.length; i++) {
                bytes32 app = firstGroup[i];
                uint256 appVotes = weekAppInfo[weekIdx][app].votes;
                if (appVotes == 0) continue;
                uint256 uv = weekVotesByUser[weekIdx][app][user];
                if (uv == 0) continue;
                uint256 appBucket = (pool * eachPct) / 100;
                payout += (uv * appBucket) / appVotes;
            }
            // third handling (if present)
            if (weekThirdVotes[weekIdx] > 0 && thirdGroup.length > 0) {
                uint256 appPct = pctThird;
                uint256 perAppPct = appPct / thirdGroup.length;
                for (uint256 i = 0; i < thirdGroup.length; i++) {
                    bytes32 app = thirdGroup[i];
                    uint256 appVotes = weekAppInfo[weekIdx][app].votes;
                    if (appVotes == 0) continue;
                    uint256 uv = weekVotesByUser[weekIdx][app][user];
                    if (uv == 0) continue;
                    uint256 appBucket = (pool * perAppPct) / 100;
                    payout += (uv * appBucket) / appVotes;
                }
            }
            return payout;
        }

        // Normal case: single firstGroup app (or empty)
        if (firstGroup.length == 1 && weekFirstVotes[weekIdx] > 0) {
            bytes32 app = firstGroup[0];
            uint256 appVotes = weekFirstVotes[weekIdx];
            uint256 uv = weekVotesByUser[weekIdx][app][user];
            if (uv > 0) {
                uint256 appBucket = (pool * pctFirst) / 100;
                payout += (uv * appBucket) / appVotes;
            }
        }

        // second group
        if (weekSecondVotes[weekIdx] > 0 && secondGroup.length > 0) {
            if (secondGroup.length > 1) {
                // tie for second => they share 40% (30+10)
                uint256 combinedPct = pctSecond + pctThird; // 40
                uint256 perAppPct = combinedPct / secondGroup.length;
                for (uint256 i = 0; i < secondGroup.length; i++) {
                    bytes32 app = secondGroup[i];
                    uint256 appVotes = weekAppInfo[weekIdx][app].votes;
                    if (appVotes == 0) continue;
                    uint256 uv = weekVotesByUser[weekIdx][app][user];
                    if (uv == 0) continue;
                    uint256 appBucket = (pool * perAppPct) / 100;
                    payout += (uv * appBucket) / appVotes;
                }
            } else {
                // single second app => 30%
                bytes32 app = secondGroup[0];
                uint256 appVotes = weekSecondVotes[weekIdx];
                uint256 uv = weekVotesByUser[weekIdx][app][user];
                if (uv > 0) {
                    uint256 appBucket = (pool * pctSecond) / 100;
                    payout += (uv * appBucket) / appVotes;
                }
            }
        }

        // third group only if not already included
        if (weekThirdVotes[weekIdx] > 0 && thirdGroup.length > 0) {
            uint256 perAppPct = pctThird / thirdGroup.length;
            for (uint256 i = 0; i < thirdGroup.length; i++) {
                bytes32 app = thirdGroup[i];
                uint256 appVotes = weekAppInfo[weekIdx][app].votes;
                if (appVotes == 0) continue;
                uint256 uv = weekVotesByUser[weekIdx][app][user];
                if (uv == 0) continue;
                uint256 appBucket = (pool * perAppPct) / 100;
                payout += (uv * appBucket) / appVotes;
            }
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
}

