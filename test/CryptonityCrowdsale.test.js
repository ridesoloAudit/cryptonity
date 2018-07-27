import ether from 'openzeppelin-solidity/test/helpers/ether';
import { advanceBlock } from 'openzeppelin-solidity/test/helpers/advanceToBlock';
import { increaseTimeTo, duration } from 'openzeppelin-solidity/test/helpers/increaseTime';
import latestTime from 'openzeppelin-solidity/test/helpers/latestTime';
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';
import assertRevert from 'openzeppelin-solidity/test/helpers/assertRevert';
const CryptonityCrowdsale = artifacts.require('CryptonityCrowdsale');
const CryptonityToken = artifacts.require('CryptonityToken');
const FiatContractMock = artifacts.require('FiatContractMock');
const RefundVault = artifacts.require('RefundVault');

const BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('CryptonityCrowdsale', function ([owner, wallet, investor]) {
  const PHASES = [
    {
      price: 23,
      bonusesPercentage: 50,
      startTime: 1541073600, // 2018-11-01 12:00 GMT+0
    },
    {
      price: 34,
      bonusesPercentage: 30,
      startTime: 1543665600, // 2018-12-01 12:00 GMT+0
    },
    {
      price: 58,
      bonusesPercentage: 15,
      startTime: 1544875200, // 2018-12-15 12:00 GMT+0
    },
  ];

  const CLOSING_TIME = 1546257600; // 2018-12-31 12:00 GMT+0

  const RATE = new BigNumber(1e13);
  const GOAL = new BigNumber(20000000);
  const CAP = new BigNumber(2012000000);
  const TOTAL_SUPPLY = ether(60000000);

  const LESS_THAN_SOFT_CAP_VALUE = 1;
  const LESS_THAN_HARD_CAP_VALUE = 500;
  const MORE_THEN_HARD_CAP_VALUE = CAP;

  let currentPhase = PHASES[0];

  function setCurrentPhase (phaseNumber = 0) {
    if (phaseNumber < 0 || phaseNumber > PHASES.length) {
      throw new Error(`phase ${phaseNumber} does not exist`);
    }
    currentPhase = PHASES[phaseNumber];
  }

  function getCurrentPhase () {
    return currentPhase;
  }

  function getPayments () {
    return {
      lessThanSoftCap: {
        value: LESS_THAN_SOFT_CAP_VALUE,
        eth: ether(LESS_THAN_SOFT_CAP_VALUE),
        tokens: ether(1)
          .mul(ether(LESS_THAN_SOFT_CAP_VALUE))
          .div(100).div(currentPhase.price).div(RATE)
          .mul((currentPhase.bonusesPercentage + 100))
          .floor(),
      },
      lessThanHardCap: {
        value: LESS_THAN_HARD_CAP_VALUE,
        eth: ether(LESS_THAN_HARD_CAP_VALUE),
        tokens: ether(1)
          .mul(ether(LESS_THAN_HARD_CAP_VALUE))
          .div(100).div(currentPhase.price).div(RATE)
          .mul((currentPhase.bonusesPercentage + 100))
          .floor(),
      },
      moreThanHardCap: {
        value: MORE_THEN_HARD_CAP_VALUE,
        eth: ether(MORE_THEN_HARD_CAP_VALUE),
        tokens: ether(1)
          .mul(ether(MORE_THEN_HARD_CAP_VALUE))
          .div(100).div(currentPhase.price).div(RATE)
          .mul((currentPhase.bonusesPercentage + 100))
          .floor(),
      },
    };
  }

  const PHASES_INTERVALS = {
    firstToSecond: PHASES[1].startTime - PHASES[0].startTime,
    secondToThird: PHASES[2].startTime - PHASES[0].startTime,
    thirdToClose: CLOSING_TIME - PHASES[0].startTime,
  };

  before(async function () {
    // Advance to the next block to correctly read time in the solidity "now" function interpreted by ganache
    await advanceBlock();
  });

  beforeEach(async function () {
    this.openingTime = latestTime() + duration.hours(1);
    this.secondPhaseStartTime = latestTime() + PHASES_INTERVALS.firstToSecond;
    this.thirdPhaseStartTime = latestTime() + PHASES_INTERVALS.secondToThird;
    this.closingTime = latestTime() + PHASES_INTERVALS.thirdToClose;
    this.afterClosingTime = this.closingTime + duration.seconds(1);
    this.afterDeliveryTime = this.closingTime + duration.weeks(3);
    this.token = await CryptonityToken.new({ from: owner });
    this.vault = await RefundVault.new(wallet, { from: owner });
    this.fiatContract = await FiatContractMock.new({ from: owner });
    this.crowdsale = await CryptonityCrowdsale.new(
      this.openingTime, this.closingTime, this.secondPhaseStartTime, this.thirdPhaseStartTime,
      RATE, wallet, this.token.address, GOAL, CAP, this.fiatContract.address
    );
    await this.token.transfer(this.crowdsale.address, TOTAL_SUPPLY, { from: owner });
    await this.token.transferOwnership(this.crowdsale.address);
    await this.vault.transferOwnership(this.crowdsale.address);
  });

  it('should create crowdsale with correct parameters', async function () {
    this.crowdsale.should.exist;
    this.token.should.exist;
    const openingTime = await this.crowdsale.openingTime();
    const closingTime = await this.crowdsale.closingTime();
    const rate = await this.crowdsale.rate();
    const walletAddress = await this.crowdsale.wallet();
    const goal = await this.crowdsale.goal();
    const cap = await this.crowdsale.cap();

    openingTime.should.be.bignumber.equal(this.openingTime);
    closingTime.should.be.bignumber.equal(this.closingTime);
    rate.should.be.bignumber.equal(RATE);
    walletAddress.should.be.equal(wallet);
    goal.should.be.bignumber.equal(GOAL);
    cap.should.be.bignumber.equal(CAP);
  });

  it('should not accept payments before start', async function () {
    await this.crowdsale.addToWhitelist(investor, { from: owner });

    await this.crowdsale.send(ether(1)).should.be.rejectedWith(EVMRevert);
    await this.crowdsale.buyTokens(investor, { from: investor, value: ether(1) }).should.be.rejectedWith(EVMRevert);
  });

  it('should not accept payments if the investor is not in the whitelist', async function () {
    await increaseTimeTo(this.openingTime);
    const investmentAmount = ether(1);

    await this.crowdsale.buyTokens(investor, { value: investmentAmount, from: investor })
      .should.be.rejectedWith(EVMRevert);
  });

  it('should accept payments during the sale when the investor is in the whitelist ', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    const investmentAmount = getPayments().lessThanSoftCap.eth;
    const expectedTokenAmount = getPayments().lessThanSoftCap.tokens;

    await this.crowdsale.buyTokens(investor, { value: investmentAmount, from: investor }).should.be.fulfilled;

    const purchasedTokenAmount = await this.crowdsale.balances(investor);
    purchasedTokenAmount.should.be.bignumber.equal(expectedTokenAmount);
  });

  it('should reject payments after end', async function () {
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });

    await this.crowdsale.send(ether(1)).should.be.rejectedWith(EVMRevert);
    await this.crowdsale.buyTokens(investor, { value: ether(1), from: investor }).should.be.rejectedWith(EVMRevert);
  });

  it('should allow finalization and transfer funds to wallet if the goal is reached', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.sendTransaction({ value: getPayments().lessThanHardCap.eth, from: investor, gasPrice: 0 });
    const beforeFinalization = web3.eth.getBalance(wallet);
    await increaseTimeTo(this.afterDeliveryTime);

    await this.crowdsale.finalize({ from: owner });

    const afterFinalization = web3.eth.getBalance(wallet);
    afterFinalization.minus(beforeFinalization).should.be.bignumber.equal(getPayments().lessThanHardCap.eth);
  });

  it('should allow refunds if the goal is not reached', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    const balanceBeforeInvestment = web3.eth.getBalance(investor);

    await this.crowdsale.sendTransaction({ value: ether(1), from: investor, gasPrice: 0 }).should.be.fulfilled;
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.finalize({ from: owner });
    await this.crowdsale.claimRefund({ from: investor, gasPrice: 0 }).should.be.fulfilled;

    const balanceAfterRefund = web3.eth.getBalance(investor);
    balanceBeforeInvestment.should.be.bignumber.equal(balanceAfterRefund);
  });

  it('should disable refunds if the goal is reached', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.sendTransaction({ value: getPayments().lessThanHardCap.eth, from: investor, gasPrice: 0 })
      .should.be.fulfilled;
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.finalize({ from: owner });

    await this.crowdsale.claimRefund({ from: investor, gasPrice: 0 }).should.be.rejectedWith(EVMRevert);
  });

  it('should return current bonus according to first phase', async function () {
    setCurrentPhase(0);
    await increaseTimeTo(this.openingTime);
    const bonus = await this.crowdsale.getCurrentBonusPercentage();
    bonus.should.be.bignumber.equal(currentPhase.bonusesPercentage);
  });

  it('should return current bonus according to second phase', async function () {
    setCurrentPhase(1);
    await increaseTimeTo(this.secondPhaseStartTime);
    const bonus = await this.crowdsale.getCurrentBonusPercentage();
    bonus.should.be.bignumber.equal(currentPhase.bonusesPercentage);
  });

  it('should return current bonus according to third phase', async function () {
    setCurrentPhase(2);
    await increaseTimeTo(this.thirdPhaseStartTime);
    const bonus = await this.crowdsale.getCurrentBonusPercentage();
    bonus.should.be.bignumber.equal(currentPhase.bonusesPercentage);
  });

  it('should return current price in cents according to first phase', async function () {
    setCurrentPhase(0);
    await increaseTimeTo(this.openingTime);
    const price = await this.crowdsale.getCurrentTokenPriceInCents();
    price.should.be.bignumber.equal(currentPhase.price);
  });

  it('should return current price in cents according to second phase', async function () {
    setCurrentPhase(1);
    await increaseTimeTo(this.secondPhaseStartTime);
    const price = await this.crowdsale.getCurrentTokenPriceInCents();
    price.should.be.bignumber.equal(currentPhase.price);
  });

  it('should return current price in cents according to third phase', async function () {
    setCurrentPhase(2);
    await increaseTimeTo(this.thirdPhaseStartTime);
    const price = await this.crowdsale.getCurrentTokenPriceInCents();
    price.should.be.bignumber.equal(currentPhase.price);
  });

  it('should reverts when trying to buy tokens when contract is paused', async function () {
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.pause({ from: owner });
    await assertRevert(this.crowdsale.sendTransaction({ from: investor, value: ether(1) }));
  });

  it('should update remaining tokens correctly according to first phase', async function () {
    const phaseNumber = 0;
    setCurrentPhase(phaseNumber);
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    const remainingPublicSupplyBeforeInvestment = await this.crowdsale.remainingPublicSupplyPerPhase(phaseNumber);

    this.crowdsale.sendTransaction({ from: investor, value: getPayments().lessThanHardCap.eth, gasPrice: 0 })
      .should.be.fulfilled;

    const purchasedTokenAmount = getPayments().lessThanHardCap.tokens.toNumber();
    const remainingPublicSupplyAfterInvestment = await this.crowdsale.remainingPublicSupplyPerPhase(phaseNumber);
    const expectedRemainingPublicSupply = remainingPublicSupplyBeforeInvestment
      .minus(remainingPublicSupplyAfterInvestment)
      .toNumber();
    expectedRemainingPublicSupply.should.be.equal(purchasedTokenAmount);
  });

  it('should update remaining tokens correctly according to second phase', async function () {
    const phaseNumber = 1;
    setCurrentPhase(phaseNumber);
    await increaseTimeTo(this.secondPhaseStartTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    const remainingPublicSupplyBeforeInvestment = await this.crowdsale.remainingPublicSupplyPerPhase(phaseNumber);

    this.crowdsale.sendTransaction({ from: investor, value: getPayments().lessThanHardCap.eth, gasPrice: 0 })
      .should.be.fulfilled;

    const purchasedTokenAmount = getPayments().lessThanHardCap.tokens.toNumber();
    const remainingPublicSupplyAfterInvestment = await this.crowdsale.remainingPublicSupplyPerPhase(phaseNumber);
    const expectedRemainingPublicSupply = remainingPublicSupplyBeforeInvestment
      .minus(remainingPublicSupplyAfterInvestment)
      .toNumber();
    expectedRemainingPublicSupply.should.be.equal(purchasedTokenAmount);
  });

  it('should update remaining tokens correctly according to third phase', async function () {
    const phaseNumber = 2;
    setCurrentPhase(phaseNumber);
    await increaseTimeTo(this.thirdPhaseStartTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    const remainingPublicSupplyBeforeInvestment = await this.crowdsale.remainingPublicSupplyPerPhase(phaseNumber);

    this.crowdsale.sendTransaction({ from: investor, value: getPayments().lessThanHardCap.eth, gasPrice: 0 })
      .should.be.fulfilled;

    const purchasedTokenAmount = getPayments().lessThanHardCap.tokens.toNumber();
    const remainingPublicSupplyAfterInvestment = await this.crowdsale.remainingPublicSupplyPerPhase(phaseNumber);
    const expectedRemainingPublicSupply = remainingPublicSupplyBeforeInvestment
      .minus(remainingPublicSupplyAfterInvestment)
      .toNumber();
    expectedRemainingPublicSupply.should.be.equal(purchasedTokenAmount);
  });

  it('should burn the remaining public tokens after finalization', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.sendTransaction({ value: ether(1), from: investor, gasPrice: 0 }).should.be.fulfilled;
    await increaseTimeTo(this.afterClosingTime);

    await this.crowdsale.finalize({ from: owner });
    for (let i = 0; i < PHASES.length; i++) {
      (await this.crowdsale.remainingPublicSupplyPerPhase(i)).should.be.bignumber.equal(0);
    }
  });

  it('should not allow beneficiaries to withdraw tokens before delivery time', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.sendTransaction({ value: getPayments().lessThanHardCap.eth, from: investor, gasPrice: 0 });
    await increaseTimeTo(this.afterClosingTime);

    await this.crowdsale.withdrawTokens({ from: investor }).should.be.rejectedWith(EVMRevert);
  });

  it('should allow beneficiaries to withdraw tokens after delivery time', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.sendTransaction({ value: getPayments().lessThanHardCap.eth, from: investor, gasPrice: 0 });
    await increaseTimeTo(this.afterDeliveryTime);

    await this.crowdsale.withdrawTokens({ from: investor }).should.be.fulfilled;
  });

  it('should not allow beneficiaries to withdraw tokens if softcap was not reached', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.sendTransaction({ value: getPayments().lessThanSoftCap.eth, from: investor, gasPrice: 0 });
    await increaseTimeTo(this.afterClosingTime);

    await this.crowdsale.withdrawTokens({ from: investor }).should.be.rejectedWith(EVMRevert);
  });

  it('should return the amount of tokens bought', async function () {
    setCurrentPhase(0);
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    const expectedBalance = getPayments().lessThanHardCap.tokens.toNumber();

    await this.crowdsale.sendTransaction({ value: getPayments().lessThanHardCap.eth, from: investor, gasPrice: 0 });
    await increaseTimeTo(this.afterDeliveryTime);
    await this.crowdsale.withdrawTokens({ from: investor });

    const balance = (await this.token.balanceOf(investor)).toNumber();
    balance.should.be.equal(expectedBalance);
  });

  it('should not allow a second call to withdrawTokens', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.sendTransaction({ value: getPayments().lessThanHardCap.eth, from: investor, gasPrice: 0 });
    await increaseTimeTo(this.afterDeliveryTime);

    await this.crowdsale.withdrawTokens({ from: investor });
    await this.crowdsale.withdrawTokens({ from: investor }).should.be.rejectedWith(EVMRevert);
  });

  it('should transfer the ownership of the token back to the owner after finalization', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.sendTransaction({ value: getPayments().lessThanSoftCap.eth, from: investor, gasPrice: 0 });
    const ownerBefore = await this.token.owner();
    ownerBefore.should.equal(this.crowdsale.address);
    await increaseTimeTo(this.afterClosingTime);

    await this.crowdsale.finalize({ from: owner });

    const ownerAfter = await this.token.owner();
    ownerAfter.should.equal(owner);
  });

  it('should not accept payments if hard cap is reached', async function () {
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    const investmentAmount = getPayments().lessThanSoftCap.eth;

    await this.crowdsale.buyTokens(investor, { value: investmentAmount, from: investor })
      .should.be.rejectedWith(EVMRevert);
  });

  it('should not accept payments if required tokens > hard cap', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    const investmentAmount = getPayments().moreThanHardCap.eth;

    await this.crowdsale.buyTokens(investor, { value: investmentAmount, from: investor })
      .should.be.rejectedWith(EVMRevert);
  });

  describe('Constructing', function () {
    it('should reverts when goal > cap', async function () {
      const HIGH_GOAL = ether(30);
      await assertRevert(CryptonityCrowdsale.new(
        this.openingTime, this.closingTime, this.secondPhaseStartTime, this.thirdPhaseStartTime,
        RATE, wallet, this.token.address, HIGH_GOAL, CAP, this.fiatContract.address
      ));
    });

    it('should reverts when openingTime > secondPhaseStartTime', async function () {
      const openingTime = this.secondPhaseStartTime + duration.hours(1);
      await assertRevert(CryptonityCrowdsale.new(
        openingTime, this.closingTime, this.secondPhaseStartTime, this.thirdPhaseStartTime,
        RATE, wallet, this.token.address, GOAL, CAP, this.fiatContract.address
      ));
    });

    it('should reverts when secondPhaseStartTime > thirdPhaseStartTime', async function () {
      const secondPhaseStartTime = this.thirdPhaseStartTime + duration.hours(1);
      await assertRevert(CryptonityCrowdsale.new(
        this.openingTime, this.closingTime, secondPhaseStartTime, this.thirdPhaseStartTime,
        RATE, wallet, this.token.address, GOAL, CAP, this.fiatContract.address
      ));
    });

    it('should reverts when thirdPhaseStartTime > closingTime', async function () {
      const thirdPhaseStartTime = this.closingTime + duration.hours(1);
      await assertRevert(CryptonityCrowdsale.new(
        this.openingTime, this.closingTime, this.secondPhaseStartTime, thirdPhaseStartTime,
        RATE, wallet, this.token.address, GOAL, CAP, this.fiatContract.address
      ));
    });
  });
});
