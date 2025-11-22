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

    // Deploy contract
    contract = await viem.deployContract(
      "MiniAppWeeklyBets",
      [mockERC20.address, protocolRecipient.account.address, startTime],
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
});

