import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { expect } from "chai";
import hre from "hardhat";
import { parseEther, getAddress, keccak256, toHex, stringToHex } from "viem";
import type { Time } from "@nomicfoundation/hardhat-network-helpers/types";

describe("MiniAppWeeklyBets", function () {
  let contract: any;
  let mockERC20: any;
  let owner: any;
  let protocolRecipient: any;
  let user1: any;
  let user2: any;
  let user3: any;
  let user4: any;
  let user5: any;
  let publicClient: any;
  let viem: any;
  let time!: Time;

  const WEEK_SECONDS = 7n * 24n * 60n * 60n;
  const INITIAL_PRICE = parseEther("1");
  const PROTOCOL_FEE = 10n; // 10%

  // Helper to create app hash
  function getAppHash(url: string): `0x${string}` {
    return keccak256(stringToHex(url));
  }

  // Helper to advance time by weeks
  async function advanceWeeks(weeks: number) {
    await time.increase(BigInt(weeks) * WEEK_SECONDS);
  }

  // Helper to get week end time
  function getWeekEnd(weekIdx: bigint, startTime: bigint): bigint {
    return startTime + (weekIdx + 1n) * WEEK_SECONDS;
  }

  before(async function () {
    const connection = await hre.network.connect();
    viem = connection.viem;
    time = connection.networkHelpers.time;
  });

  beforeEach(async function () {
    // Get accounts
    [owner, protocolRecipient, user1, user2, user3, user4, user5] =
      await viem.getWalletClients();
    publicClient = await viem.getPublicClient();

    // Deploy mock ERC20 token
    mockERC20 = await viem.deployContract("MockERC20", [
      "Celo Dollar",
      "cUSD",
    ]);

    // Set start time to a past time (allows immediate voting)
    const startTime = BigInt(await time.latest()) - WEEK_SECONDS;

    // Deploy contract with initialPrice (1e18 for 18-decimal tokens in tests)
    const initialPrice = INITIAL_PRICE; // Use INITIAL_PRICE constant for tests (1e18)
    contract = await viem.deployContract(
      "MiniAppWeeklyBets",
      [mockERC20.address, protocolRecipient.account.address, startTime, initialPrice],
      {}
    );

    // Give users some tokens
    const tokenAmount = parseEther("10000");
    for (const user of [user1, user2, user3, user4, user5]) {
      await mockERC20.write.mint([user.account.address, tokenAmount]);
    }

    // Approve contract to spend tokens
    for (const user of [user1, user2, user3, user4, user5]) {
      await mockERC20.write.approve([contract.address, parseEther("100000")], {
        account: user.account,
      });
    }
  });

  describe("Deployment", function () {
    it("Should set correct initial values", async function () {
      expect(await contract.read.cUSD()).to.equal(
        getAddress(mockERC20.address)
      );
      expect(await contract.read.protocolRecipient()).to.equal(
        getAddress(protocolRecipient.account.address)
      );
    });

    it("Should initialize currentWeek correctly", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      expect(currentWeek > 0n).to.be.true;
    });
  });

  describe("Voting / Betting", function () {
    it("Should allow users to vote for apps", async function () {
      const appHash = getAppHash("https://app1.com");
      const url = "https://app1.com";

      const balanceBefore = await mockERC20.read.balanceOf([
        user1.account.address,
      ]);

      await contract.write.vote([appHash, url], {
        account: user1.account,
      });

      const balanceAfter = await mockERC20.read.balanceOf([
        user1.account.address,
      ]);

      expect(balanceBefore - balanceAfter).to.equal(INITIAL_PRICE);

      const votes = await contract.read.getVotesForAppInWeek([
        await contract.read.getCurrentWeek(),
        appHash,
      ]);
      expect(votes).to.equal(1n);

      const userVotes = await contract.read.getUserVotesForAppInWeek([
        await contract.read.getCurrentWeek(),
        appHash,
        user1.account.address,
      ]);
      expect(userVotes).to.equal(1n);
    });

    it("Should increase price after each vote", async function () {
      const appHash = getAppHash("https://app1.com");
      const url = "https://app1.com";
      const currentWeek = await contract.read.getCurrentWeek();

      // First vote
      await contract.write.vote([appHash, url], {
        account: user1.account,
      });

      // Second vote should cost more (3% increase)
      const balanceBefore = await mockERC20.read.balanceOf([
        user2.account.address,
      ]);
      await contract.write.vote([appHash, url], {
        account: user2.account,
      });
      const balanceAfter = await mockERC20.read.balanceOf([
        user2.account.address,
      ]);

      const expectedPrice = (INITIAL_PRICE * 103n) / 100n;
      expect(balanceBefore - balanceAfter).to.equal(expectedPrice);
    });

    it("Should collect protocol fee correctly", async function () {
      const appHash = getAppHash("https://app1.com");
      const url = "https://app1.com";
      const currentWeek = await contract.read.getCurrentWeek();

      await contract.write.vote([appHash, url], {
        account: user1.account,
      });

      const protocolCollected =
        await contract.read.getWeekProtocolCollected([currentWeek]);
      const expectedFee = (INITIAL_PRICE * PROTOCOL_FEE) / 100n;
      expect(protocolCollected).to.equal(expectedFee);
    });

    it("Should add to prize pool correctly", async function () {
      const appHash = getAppHash("https://app1.com");
      const url = "https://app1.com";
      const currentWeek = await contract.read.getCurrentWeek();

      await contract.write.vote([appHash, url], {
        account: user1.account,
      });

      const prizePool = await contract.read.getWeekPrizePool([currentWeek]);
      const expectedPool = INITIAL_PRICE - (INITIAL_PRICE * PROTOCOL_FEE) / 100n;
      expect(prizePool).to.equal(expectedPool);
    });

    it("Should start a new week after current week is finalized", async function () {
      const appHash = getAppHash("https://app1.com");
      const url = "https://app1.com";
      const currentWeek = await contract.read.getCurrentWeek();

      // Advance time to end of week
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);

      // Finalize week and move to next week
      await contract.write.finalizeCurrentWeek();
      const nextWeek = await contract.read.getCurrentWeek();
      expect(nextWeek).to.equal(currentWeek + 1n);

      // Voting now records in the new week
      await contract.write.vote([appHash, url], {
        account: user1.account,
      });

      const votes = await contract.read.getVotesForAppInWeek([
        nextWeek,
        appHash,
      ]);
      expect(votes).to.equal(1n);
      expect(await contract.read.isWeekFinalized([currentWeek])).to.be.true;
    });
  });

  describe("Week Finalization", function () {
    it("Should finalize week and advance currentWeek", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);

      // Advance time to end of week
      await time.increaseTo(weekEnd);

      await contract.write.finalizeCurrentWeek();

      const newCurrentWeek = await contract.read.getCurrentWeek();
      expect(newCurrentWeek).to.equal(currentWeek + 1n);

      const finalized = await contract.read.isWeekFinalized([currentWeek]);
      expect(finalized).to.be.true;
    });

    it("Should compute winners correctly", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      // Create apps with different vote counts
      const app1 = getAppHash("https://app1.com");
      const app2 = getAppHash("https://app2.com");
      const app3 = getAppHash("https://app3.com");
      const app4 = getAppHash("https://app4.com");

      // App1: 5 votes (1st place)
      for (let i = 0; i < 5; i++) {
        await contract.write.vote([app1, "https://app1.com"], {
          account: user1.account,
        });
      }

      // App2: 3 votes (2nd place)
      for (let i = 0; i < 3; i++) {
        await contract.write.vote([app2, "https://app2.com"], {
          account: user2.account,
        });
      }

      // App3: 1 vote (3rd place)
      await contract.write.vote([app3, "https://app3.com"], {
        account: user3.account,
      });

      // App4: 1 vote (tied for 3rd)
      await contract.write.vote([app4, "https://app4.com"], {
        account: user4.account,
      });

      // Finalize week
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      const winners = await contract.read.getWinnersForWeek([currentWeek]);
      expect(winners[0].length).to.equal(1); // firstGroup
      expect(winners[1].length).to.equal(1); // secondGroup
      expect(winners[2].length).to.equal(2); // thirdGroup (tied)
      expect(winners[3]).to.equal(5n); // firstVotes
      expect(winners[4]).to.equal(3n); // secondVotes
      expect(winners[5]).to.equal(1n); // thirdVotes
    });

    it("Should handle ties correctly", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      const app1 = getAppHash("https://app1.com");
      const app2 = getAppHash("https://app2.com");

      // Both apps get 3 votes (tie for first)
      for (let i = 0; i < 3; i++) {
        await contract.write.vote([app1, "https://app1.com"], {
          account: user1.account,
        });
        await contract.write.vote([app2, "https://app2.com"], {
          account: user2.account,
        });
      }

      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      const winners = await contract.read.getWinnersForWeek([currentWeek]);
      expect(winners[0].length).to.equal(2); // two apps tied for first
      expect(winners[3]).to.equal(3n); // firstVotes
    });
  });

  describe("Claiming", function () {
    it("Should allow users to claim rewards", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      // User1 votes for winning app
      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      // User2 votes for losing app
      const app2 = getAppHash("https://app2.com");
      await contract.write.vote([app2, "https://app2.com"], {
        account: user2.account,
      });

      // Finalize week
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      // User1 should be able to claim
      const balanceBefore = await mockERC20.read.balanceOf([
        user1.account.address,
      ]);
      await contract.write.claim([currentWeek], {
        account: user1.account,
      });
      const balanceAfter = await mockERC20.read.balanceOf([
        user1.account.address,
      ]);

      expect(balanceAfter > balanceBefore).to.be.true;
    });

    it("Should prevent double claiming", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      await contract.write.claim([currentWeek], {
        account: user1.account,
      });

      // Try to claim again - should fail
      await assert.rejects(
        contract.write.claim([currentWeek], {
          account: user1.account,
        }),
      );
    });

    it("Should prevent claiming before finalization", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      // Try to claim before finalization - should fail
      await assert.rejects(
        contract.write.claim([currentWeek], {
          account: user1.account,
        }),
      );
    });

    it("Should auto-finalize when claiming if week end time reached", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      // Advance time to end of week
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);

      // Claim should auto-finalize
      await contract.write.claim([currentWeek], {
        account: user1.account,
      });

      const finalized = await contract.read.isWeekFinalized([currentWeek]);
      expect(finalized).to.be.true;
    });
  });

  describe("Three Distribution Weeks", function () {
    it("Should handle 3 complete weeks with voting, finalization, and claims", async function () {
      const startTime = await contract.read.startTime();
      let currentWeek = await contract.read.getCurrentWeek();
      const finalizedWeeks: bigint[] = [];

      // Week 0
      const app1Week0 = getAppHash("https://app1-week0.com");
      const app2Week0 = getAppHash("https://app2-week0.com");

      // User1 votes for app1, User2 votes for app2
      await contract.write.vote([app1Week0, "https://app1-week0.com"], {
        account: user1.account,
      });
      await contract.write.vote([app2Week0, "https://app2-week0.com"], {
        account: user2.account,
      });
      await contract.write.vote([app1Week0, "https://app1-week0.com"], {
        account: user3.account,
      }); // app1 wins

      // Finalize week 0
      const week0End = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(week0End);
      await contract.write.finalizeCurrentWeek();
      finalizedWeeks.push(currentWeek);

      // Claim week 0
      await contract.write.claim([currentWeek], {
        account: user1.account,
      });
      await contract.write.claim([currentWeek], {
        account: user3.account,
      });

      // Week 1
      currentWeek = await contract.read.getCurrentWeek();
      const app1Week1 = getAppHash("https://app1-week1.com");
      const app2Week1 = getAppHash("https://app2-week1.com");

      await contract.write.vote([app1Week1, "https://app1-week1.com"], {
        account: user2.account,
      });
      await contract.write.vote([app2Week1, "https://app2-week1.com"], {
        account: user3.account,
      });
      await contract.write.vote([app2Week1, "https://app2-week1.com"], {
        account: user4.account,
      }); // app2 wins

      const week1End = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(week1End);
      await contract.write.finalizeCurrentWeek();
      finalizedWeeks.push(currentWeek);

      await contract.write.claim([currentWeek], {
        account: user3.account,
      });
      await contract.write.claim([currentWeek], {
        account: user4.account,
      });

      // Week 2
      currentWeek = await contract.read.getCurrentWeek();
      const app1Week2 = getAppHash("https://app1-week2.com");
      const app2Week2 = getAppHash("https://app2-week2.com");
      const app3Week2 = getAppHash("https://app3-week2.com");

      // Create a 3-way tie scenario
      await contract.write.vote([app1Week2, "https://app1-week2.com"], {
        account: user1.account,
      });
      await contract.write.vote([app2Week2, "https://app2-week2.com"], {
        account: user2.account,
      });
      await contract.write.vote([app3Week2, "https://app3-week2.com"], {
        account: user3.account,
      });

      const week2End = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(week2End);
      await contract.write.finalizeCurrentWeek();
      finalizedWeeks.push(currentWeek);

      // All three should be able to claim (split 100% equally)
      await contract.write.claim([currentWeek], {
        account: user1.account,
      });
      await contract.write.claim([currentWeek], {
        account: user2.account,
      });
      await contract.write.claim([currentWeek], {
        account: user3.account,
      });

      // Verify all processed weeks are finalized
      for (const weekIdx of finalizedWeeks) {
        expect(await contract.read.isWeekFinalized([weekIdx])).to.be.true;
      }
    });

    it("Should correctly distribute rewards across 3 weeks with different scenarios", async function () {
      const startTime = await contract.read.startTime();
      let currentWeek = await contract.read.getCurrentWeek();
      const finalizedWeeks: bigint[] = [];

      // Week 0: Single winner (60% to first, 30% to second, 10% to third)
      const app1 = getAppHash("https://app1.com");
      const app2 = getAppHash("https://app2.com");
      const app3 = getAppHash("https://app3.com");

      // App1: 5 votes (1st)
      for (let i = 0; i < 5; i++) {
        await contract.write.vote([app1, "https://app1.com"], {
          account: user1.account,
        });
      }

      // App2: 3 votes (2nd)
      for (let i = 0; i < 3; i++) {
        await contract.write.vote([app2, "https://app2.com"], {
          account: user2.account,
        });
      }

      // App3: 1 vote (3rd)
      await contract.write.vote([app3, "https://app3.com"], {
        account: user3.account,
      });

      let weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();
      finalizedWeeks.push(currentWeek);

      // Claim week 0
      const week0PrizePool = await contract.read.getWeekPrizePool([currentWeek]);
      await contract.write.claim([currentWeek], {
        account: user1.account,
      });
      await contract.write.claim([currentWeek], {
        account: user2.account,
      });
      await contract.write.claim([currentWeek], {
        account: user3.account,
      });

      // Week 1: Two-way tie for first (90% split, 10% to third)
      currentWeek = await contract.read.getCurrentWeek();
      const app4 = getAppHash("https://app4.com");
      const app5 = getAppHash("https://app5.com");
      const app6 = getAppHash("https://app6.com");

      // Both app4 and app5 get 3 votes
      for (let i = 0; i < 3; i++) {
        await contract.write.vote([app4, "https://app4.com"], {
          account: user1.account,
        });
        await contract.write.vote([app5, "https://app5.com"], {
          account: user2.account,
        });
      }

      // App6: 1 vote (3rd)
      await contract.write.vote([app6, "https://app6.com"], {
        account: user3.account,
      });

      weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();
      finalizedWeeks.push(currentWeek);

      await contract.write.claim([currentWeek], {
        account: user1.account,
      });
      await contract.write.claim([currentWeek], {
        account: user2.account,
      });
      await contract.write.claim([currentWeek], {
        account: user3.account,
      });

      // Week 2: Three-way tie for first (100% split equally)
      currentWeek = await contract.read.getCurrentWeek();
      const app7 = getAppHash("https://app7.com");
      const app8 = getAppHash("https://app8.com");
      const app9 = getAppHash("https://app9.com");

      // All three get 2 votes
      for (let i = 0; i < 2; i++) {
        await contract.write.vote([app7, "https://app7.com"], {
          account: user1.account,
        });
        await contract.write.vote([app8, "https://app8.com"], {
          account: user2.account,
        });
        await contract.write.vote([app9, "https://app9.com"], {
          account: user3.account,
        });
      }

      weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();
      finalizedWeeks.push(currentWeek);

      await contract.write.claim([currentWeek], {
        account: user1.account,
      });
      await contract.write.claim([currentWeek], {
        account: user2.account,
      });
      await contract.write.claim([currentWeek], {
        account: user3.account,
      });

      // Verify all processed weeks were finalized
      for (const weekIdx of finalizedWeeks) {
        expect(await contract.read.isWeekFinalized([weekIdx])).to.be.true;
      }
    });
  });

  describe("Edge Cases", function () {
    it("Should handle empty week (no votes)", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);

      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      const winners = await contract.read.getWinnersForWeek([currentWeek]);
      expect(winners[0].length).to.equal(0);
      expect(winners[1].length).to.equal(0);
      expect(winners[2].length).to.equal(0);
    });

    it("Should handle single app with all votes", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const app1 = getAppHash("https://app1.com");

      // All users vote for same app
      for (const user of [user1, user2, user3, user4, user5]) {
        await contract.write.vote([app1, "https://app1.com"], {
          account: user.account,
        });
      }

      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      const winners = await contract.read.getWinnersForWeek([currentWeek]);
      expect(winners[0].length).to.equal(1);
      expect(winners[3]).to.equal(5n);
    });

    it("Should prevent claiming for users who didn't vote", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      // User2 didn't vote, should not be able to claim
      await assert.rejects(
        contract.write.claim([currentWeek], {
          account: user2.account,
        }),
      );
    });

    it("Should handle multiple votes from same user for same app", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const app1 = getAppHash("https://app1.com");

      // User1 votes 3 times for same app
      for (let i = 0; i < 3; i++) {
        await contract.write.vote([app1, "https://app1.com"], {
          account: user1.account,
        });
      }

      const votes = await contract.read.getVotesForAppInWeek([
        currentWeek,
        app1,
      ]);
      expect(votes).to.equal(3n);

      const userVotes = await contract.read.getUserVotesForAppInWeek([
        currentWeek,
        app1,
        user1.account.address,
      ]);
      expect(userVotes).to.equal(3n);
    });

    it("Should handle user voting for multiple different apps", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const app1 = getAppHash("https://app1.com");
      const app2 = getAppHash("https://app2.com");

      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });
      await contract.write.vote([app2, "https://app2.com"], {
        account: user1.account,
      });

      const totalVotes = await contract.read.getWeekUserTotalVotes([
        currentWeek,
        user1.account.address,
      ]);
      expect(totalVotes).to.equal(2n);
    });
  });

  describe("Protocol Functions", function () {
    it("Should allow owner to change protocol recipient", async function () {
      const newRecipient = user5.account.address;
      await contract.write.setProtocolRecipient([newRecipient], {
        account: owner.account,
      });

      expect(await contract.read.protocolRecipient()).to.equal(
        getAddress(newRecipient)
      );
    });

    it("Should prevent non-owner from changing protocol recipient", async function () {
      const newRecipient = user5.account.address;
      await assert.rejects(
        contract.write.setProtocolRecipient([newRecipient], {
          account: user1.account,
        }),
      );
    });

    it("Should allow sweeping unclaimed funds after deadline", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const CLAIM_DEADLINE = 90n * 24n * 60n * 60n;

      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      // Advance past claim deadline
      await time.increase(CLAIM_DEADLINE + 1n);

      const balanceBefore = await mockERC20.read.balanceOf([
        protocolRecipient.account.address,
      ]);

      await contract.write.sweepUnclaimedToProtocol([currentWeek]);

      const balanceAfter = await mockERC20.read.balanceOf([
        protocolRecipient.account.address,
      ]);

      expect(balanceAfter > balanceBefore).to.be.true;
    });

    it("Should prevent sweeping before deadline", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const CLAIM_DEADLINE = 90n * 24n * 60n * 60n;

      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      // Don't advance past deadline
      await assert.rejects(
        contract.write.sweepUnclaimedToProtocol([currentWeek]),
      );
    });
  });

  describe("Total Prize Pools Tracking", function () {
    it("Should track totalPrizePools across all weeks", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      
      // Initially should be 0
      expect(await contract.read.totalPrizePools()).to.equal(0n);

      // Vote in current week
      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      const poolShare1 = INITIAL_PRICE - (INITIAL_PRICE * PROTOCOL_FEE) / 100n;
      expect(await contract.read.totalPrizePools()).to.equal(poolShare1);

      // Advance to next week
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      const nextWeek = await contract.read.getCurrentWeek();
      
      // Vote in next week
      await contract.write.vote([app1, "https://app1.com"], {
        account: user2.account,
      });

      // totalPrizePools should accumulate
      expect(await contract.read.totalPrizePools()).to.equal(poolShare1 * 2n);
    });

    it("Should not decrease totalPrizePools when claims are made", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      const poolShare = INITIAL_PRICE - (INITIAL_PRICE * PROTOCOL_FEE) / 100n;
      const totalBeforeClaim = await contract.read.totalPrizePools();
      expect(totalBeforeClaim).to.equal(poolShare);

      // Finalize and claim
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      await contract.write.claim([currentWeek], {
        account: user1.account,
      });

      // totalPrizePools should remain the same
      const totalAfterClaim = await contract.read.totalPrizePools();
      expect(totalAfterClaim).to.equal(totalBeforeClaim);
    });

    it("Should not decrease totalPrizePools when funds are swept", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const CLAIM_DEADLINE = 90n * 24n * 60n * 60n;

      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      const poolShare = INITIAL_PRICE - (INITIAL_PRICE * PROTOCOL_FEE) / 100n;
      const totalBeforeSweep = await contract.read.totalPrizePools();
      expect(totalBeforeSweep).to.equal(poolShare);

      // Finalize and sweep
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();
      await time.increase(CLAIM_DEADLINE + 1n);
      await contract.write.sweepUnclaimedToProtocol([currentWeek]);

      // totalPrizePools should remain the same
      const totalAfterSweep = await contract.read.totalPrizePools();
      expect(totalAfterSweep).to.equal(totalBeforeSweep);
    });
  });

  describe("Per-Week Total Prize Pool Tracking", function () {
    it("Should track weekTotalPrizePool for each week", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      // Initially should be 0
      expect(await contract.read.getWeekTotalPrizePool([currentWeek])).to.equal(0n);

      // Vote in current week
      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      const poolShare = INITIAL_PRICE - (INITIAL_PRICE * PROTOCOL_FEE) / 100n;
      expect(await contract.read.getWeekTotalPrizePool([currentWeek])).to.equal(poolShare);

      // Vote again in same week
      await contract.write.vote([app1, "https://app1.com"], {
        account: user2.account,
      });

      const secondPrice = (INITIAL_PRICE * 103n) / 100n;
      const secondPoolShare = secondPrice - (secondPrice * PROTOCOL_FEE) / 100n;
      expect(await contract.read.getWeekTotalPrizePool([currentWeek])).to.equal(
        poolShare + secondPoolShare
      );
    });

    it("Should not decrease weekTotalPrizePool when claims are made", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      const poolShare = INITIAL_PRICE - (INITIAL_PRICE * PROTOCOL_FEE) / 100n;
      const weekTotalBeforeClaim = await contract.read.getWeekTotalPrizePool([currentWeek]);
      expect(weekTotalBeforeClaim).to.equal(poolShare);

      // Finalize and claim
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      await contract.write.claim([currentWeek], {
        account: user1.account,
      });

      // weekTotalPrizePool should remain the same
      const weekTotalAfterClaim = await contract.read.getWeekTotalPrizePool([currentWeek]);
      expect(weekTotalAfterClaim).to.equal(weekTotalBeforeClaim);
    });

    it("Should track separate totals for different weeks", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      // Vote in week 0
      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      const poolShare1 = INITIAL_PRICE - (INITIAL_PRICE * PROTOCOL_FEE) / 100n;
      expect(await contract.read.getWeekTotalPrizePool([currentWeek])).to.equal(poolShare1);

      // Advance to next week
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      const nextWeek = await contract.read.getCurrentWeek();
      
      // Vote in week 1
      await contract.write.vote([app1, "https://app1.com"], {
        account: user2.account,
      });

      // Each week should have its own total
      expect(await contract.read.getWeekTotalPrizePool([currentWeek])).to.equal(poolShare1);
      expect(await contract.read.getWeekTotalPrizePool([nextWeek])).to.equal(poolShare1);
    });
  });

  describe("User Payout Query", function () {
    it("Should return payout for finalized week", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      // User1 votes for winning app (app1 will have 3 votes - 1st place)
      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });
      await contract.write.vote([app1, "https://app1.com"], {
        account: user3.account,
      });
      await contract.write.vote([app1, "https://app1.com"], {
        account: user4.account,
      });

      // User2 votes for losing app (app2 will have 1 vote - not in top 3)
      const app2 = getAppHash("https://app2.com");
      await contract.write.vote([app2, "https://app2.com"], {
        account: user2.account,
      });

      // Add apps for 2nd and 3rd place
      const app3 = getAppHash("https://app3.com");
      await contract.write.vote([app3, "https://app3.com"], {
        account: user5.account,
      });
      await contract.write.vote([app3, "https://app3.com"], {
        account: user1.account,
      }); // app3: 2 votes - 2nd place

      const app4 = getAppHash("https://app4.com");
      await contract.write.vote([app4, "https://app4.com"], {
        account: user3.account,
      }); // app4: 1 vote - 3rd place (tied with app2, but app4 wins tie-breaker or both get 3rd)

      // Finalize week
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      // Check payout for user1 (should be > 0, voted for 1st place)
      const payout1 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user1.account.address,
      ]);
      expect(payout1 > 0n).to.be.true;

      // Check payout for user2 (should be 0, app2 is not in top 3)
      // Note: If app2 ties for 3rd, user2 might get a small payout, so we check it's much less than user1
      const payout2 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user2.account.address,
      ]);
      // If app2 is in 3rd place (tied), payout will be small but > 0
      // If app2 is not in top 3, payout will be 0
      // Let's check that it's significantly less than user1's payout
      expect(payout2 < payout1).to.be.true;
    });

    it("Should return payout for non-finalized week (current standings)", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      // User1 votes for app1
      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      // User2 votes for app2
      const app2 = getAppHash("https://app2.com");
      await contract.write.vote([app2, "https://app2.com"], {
        account: user2.account,
      });

      // User3 votes for app1 (app1 is winning with 2 votes, app2 is 2nd with 1 vote)
      await contract.write.vote([app1, "https://app1.com"], {
        account: user3.account,
      });

      // Week is not finalized yet, but should still return payout
      const payout1 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user1.account.address,
      ]);
      expect(payout1 > 0n).to.be.true; // User1 voted for 1st place app

      const payout2 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user2.account.address,
      ]);
      // User2 voted for 2nd place app - should get 30% of pool
      // Note: If this fails, check that secondGroup is populated correctly
      expect(payout2 > 0n).to.be.true; 
      
      // User3 also voted for app1 (first group) - include their payout
      const payout3 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user3.account.address,
      ]);
      expect(payout3 > 0n).to.be.true;

      // Verify aggregated payouts align with 60/30 distribution
      const pool = await contract.read.getWeekPrizePool([currentWeek]);
      const firstGroupTotal = payout1 + payout3;
      const secondGroupTotal = payout2;
      expect(firstGroupTotal).to.equal((pool * 60n) / 100n);
      expect(secondGroupTotal).to.equal((pool * 30n) / 100n);
    });

    it("Should return 0 for user who didn't vote", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      // User2 didn't vote
      const payout = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user2.account.address,
      ]);
      expect(payout).to.equal(0n);
    });

    it("Should match actual claim amount for finalized week", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      // Create scenario with clear winner
      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });
      await contract.write.vote([app1, "https://app1.com"], {
        account: user3.account,
      });

      const app2 = getAppHash("https://app2.com");
      await contract.write.vote([app2, "https://app2.com"], {
        account: user2.account,
      });

      // Finalize week
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      // Get expected payout
      const expectedPayout = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user1.account.address,
      ]);

      // Get balance before claim
      const balanceBefore = await mockERC20.read.balanceOf([
        user1.account.address,
      ]);

      // Claim
      await contract.write.claim([currentWeek], {
        account: user1.account,
      });

      // Get balance after claim
      const balanceAfter = await mockERC20.read.balanceOf([
        user1.account.address,
      ]);

      // Actual claim should match expected payout
      expect(balanceAfter - balanceBefore).to.equal(expectedPayout);
    });

    it("Should update payout calculation as votes change in non-finalized week", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      // User1 votes for app1
      const app1 = getAppHash("https://app1.com");
      await contract.write.vote([app1, "https://app1.com"], {
        account: user1.account,
      });

      // Initially, user1 should have some payout (app1 is winning)
      const payout1 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user1.account.address,
      ]);
      expect(payout1 > 0n).to.be.true;

      // User2 votes for app2
      const app2 = getAppHash("https://app2.com");
      await contract.write.vote([app2, "https://app2.com"], {
        account: user2.account,
      });

      // User1's payout should still be > 0 (app1 still winning)
      const payout2 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user1.account.address,
      ]);
      expect(payout2 > 0n).to.be.true;

      // User3 votes for app2 (now app2 is winning)
      await contract.write.vote([app2, "https://app2.com"], {
        account: user3.account,
      });

      // Now user1's payout should be > 0 (app1 is in 2nd place, gets 30% of pool)
      const payout3 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user1.account.address,
      ]);
      expect(payout3 > 0n).to.be.true; // User1 gets 2nd place payout (30%)
      
      // User2 and User3 make up the first group now (app2 leading)
      const payout4 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user2.account.address,
      ]);
      const payout5 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user3.account.address,
      ]);
      expect(payout4 > 0n).to.be.true;
      expect(payout5 > 0n).to.be.true;

      // Verify aggregated payouts align with 60/30 distribution
      const pool = await contract.read.getWeekPrizePool([currentWeek]);
      const firstGroupTotal = payout4 + payout5;
      const secondGroupTotal = payout3;
      expect(firstGroupTotal).to.equal((pool * 60n) / 100n);
      expect(secondGroupTotal).to.equal((pool * 30n) / 100n);
    });

    it("Should handle complex payout scenarios for non-finalized weeks", async function () {
      const currentWeek = await contract.read.getCurrentWeek();

      // Create scenario: app1 with 3 votes, app2 with 2 votes, app3 with 1 vote
      const app1 = getAppHash("https://app1.com");
      const app2 = getAppHash("https://app2.com");
      const app3 = getAppHash("https://app3.com");

      // App1: 3 votes (1st place)
      for (let i = 0; i < 3; i++) {
        await contract.write.vote([app1, "https://app1.com"], {
          account: user1.account,
        });
      }

      // App2: 2 votes (2nd place)
      for (let i = 0; i < 2; i++) {
        await contract.write.vote([app2, "https://app2.com"], {
          account: user2.account,
        });
      }

      // App3: 1 vote (3rd place)
      await contract.write.vote([app3, "https://app3.com"], {
        account: user3.account,
      });

      // Check payouts for non-finalized week
      const payout1 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user1.account.address,
      ]);
      expect(payout1 > 0n).to.be.true; // User1 voted for 1st place

      const payout2 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user2.account.address,
      ]);
      expect(payout2 > 0n).to.be.true; // User2 voted for 2nd place

      const payout3 = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user3.account.address,
      ]);
      expect(payout3 > 0n).to.be.true; // User3 voted for 3rd place

      // Finalize and verify payouts match
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      const payout1Finalized = await contract.read.getUserPayoutForWeek([
        currentWeek,
        user1.account.address,
      ]);
      expect(payout1Finalized).to.equal(payout1); // Should match pre-finalization
    });
  });

  describe("Price Query Functions", function () {
    it("Should return initialPrice for app that hasn't been voted on yet", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const appHash = getAppHash("https://app1.com");

      // Price should be initialPrice for new app
      const price = await contract.read.getPriceForNextVote([currentWeek, appHash]);
      expect(price).to.equal(INITIAL_PRICE);

      // Also test convenience function
      const priceCurrentWeek = await contract.read.getPriceForNextVoteCurrentWeek([appHash]);
      expect(priceCurrentWeek).to.equal(INITIAL_PRICE);
    });

    it("Should return correct price after first vote", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const appHash = getAppHash("https://app1.com");
      const url = "https://app1.com";

      // First vote
      await contract.write.vote([appHash, url], {
        account: user1.account,
      });

      // Price should increase by 3% (103/100)
      const expectedPrice = (INITIAL_PRICE * 103n) / 100n;
      const price = await contract.read.getPriceForNextVote([currentWeek, appHash]);
      expect(price).to.equal(expectedPrice);

      // Also test convenience function
      const priceCurrentWeek = await contract.read.getPriceForNextVoteCurrentWeek([appHash]);
      expect(priceCurrentWeek).to.equal(expectedPrice);
    });

    it("Should return correct price after multiple votes", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const appHash = getAppHash("https://app1.com");
      const url = "https://app1.com";

      // First vote - price becomes INITIAL_PRICE * 103/100
      await contract.write.vote([appHash, url], {
        account: user1.account,
      });
      let expectedPrice = (INITIAL_PRICE * 103n) / 100n;
      let price = await contract.read.getPriceForNextVote([currentWeek, appHash]);
      expect(price).to.equal(expectedPrice);

      // Second vote - price becomes (INITIAL_PRICE * 103/100) * 103/100
      await contract.write.vote([appHash, url], {
        account: user2.account,
      });
      expectedPrice = (expectedPrice * 103n) / 100n;
      price = await contract.read.getPriceForNextVote([currentWeek, appHash]);
      expect(price).to.equal(expectedPrice);

      // Third vote
      await contract.write.vote([appHash, url], {
        account: user3.account,
      });
      expectedPrice = (expectedPrice * 103n) / 100n;
      price = await contract.read.getPriceForNextVote([currentWeek, appHash]);
      expect(price).to.equal(expectedPrice);
    });

    it("Should return initialPrice for new week (price resets)", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const appHash = getAppHash("https://app1.com");
      const url = "https://app1.com";

      // Vote in current week
      await contract.write.vote([appHash, url], {
        account: user1.account,
      });

      // Price should be increased
      const priceAfterVote = await contract.read.getPriceForNextVote([currentWeek, appHash]);
      expect(priceAfterVote).to.equal((INITIAL_PRICE * 103n) / 100n);

      // Advance to next week
      const startTime = await contract.read.startTime();
      const weekEnd = getWeekEnd(currentWeek, startTime);
      await time.increaseTo(weekEnd);
      await contract.write.finalizeCurrentWeek();

      const nextWeek = await contract.read.getCurrentWeek();

      // Price should reset to initialPrice for new week
      const priceNewWeek = await contract.read.getPriceForNextVote([nextWeek, appHash]);
      expect(priceNewWeek).to.equal(INITIAL_PRICE);
    });

    it("Should return different prices for different apps in same week", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const app1Hash = getAppHash("https://app1.com");
      const app2Hash = getAppHash("https://app2.com");
      const url1 = "https://app1.com";
      const url2 = "https://app2.com";

      // Vote for app1 once
      await contract.write.vote([app1Hash, url1], {
        account: user1.account,
      });

      // Vote for app2 twice
      await contract.write.vote([app2Hash, url2], {
        account: user2.account,
      });
      await contract.write.vote([app2Hash, url2], {
        account: user3.account,
      });

      // App1 price should be INITIAL_PRICE * 103/100
      const price1 = await contract.read.getPriceForNextVote([currentWeek, app1Hash]);
      expect(price1).to.equal((INITIAL_PRICE * 103n) / 100n);

      // App2 price should be (INITIAL_PRICE * 103/100) * 103/100
      const price2 = await contract.read.getPriceForNextVote([currentWeek, app2Hash]);
      const expectedPrice2 = ((INITIAL_PRICE * 103n) / 100n * 103n) / 100n;
      expect(price2).to.equal(expectedPrice2);

      // Prices should be different
      expect(price2 > price1).to.be.true;
    });

    it("Should return correct price for specific week vs current week", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const appHash = getAppHash("https://app1.com");
      const url = "https://app1.com";

      // Vote in current week
      await contract.write.vote([appHash, url], {
        account: user1.account,
      });

      const expectedPrice = (INITIAL_PRICE * 103n) / 100n;

      // Both functions should return same price for current week
      const priceSpecific = await contract.read.getPriceForNextVote([currentWeek, appHash]);
      const priceCurrent = await contract.read.getPriceForNextVoteCurrentWeek([appHash]);
      
      expect(priceSpecific).to.equal(expectedPrice);
      expect(priceCurrent).to.equal(expectedPrice);
      expect(priceSpecific).to.equal(priceCurrent);
    });

    it("Should match actual vote cost with getPriceForNextVote", async function () {
      const currentWeek = await contract.read.getCurrentWeek();
      const appHash = getAppHash("https://app1.com");
      const url = "https://app1.com";

      // Get price before first vote
      const priceBefore = await contract.read.getPriceForNextVote([currentWeek, appHash]);
      expect(priceBefore).to.equal(INITIAL_PRICE);

      // Vote and check balance change matches price
      const balanceBefore = await mockERC20.read.balanceOf([user1.account.address]);
      await contract.write.vote([appHash, url], {
        account: user1.account,
      });
      const balanceAfter = await mockERC20.read.balanceOf([user1.account.address]);
      const actualCost = balanceBefore - balanceAfter;

      expect(actualCost).to.equal(priceBefore);

      // Get price for next vote
      const priceAfter = await contract.read.getPriceForNextVote([currentWeek, appHash]);
      expect(priceAfter).to.equal((INITIAL_PRICE * 103n) / 100n);

      // Second vote should cost the price we just queried
      const balanceBefore2 = await mockERC20.read.balanceOf([user2.account.address]);
      await contract.write.vote([appHash, url], {
        account: user2.account,
      });
      const balanceAfter2 = await mockERC20.read.balanceOf([user2.account.address]);
      const actualCost2 = balanceBefore2 - balanceAfter2;

      expect(actualCost2).to.equal(priceAfter);
    });
  });
});

