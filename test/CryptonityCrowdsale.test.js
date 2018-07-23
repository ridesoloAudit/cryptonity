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

  const PHASES = {
    prices: {
      first: 23,
      second: 34,
      third: 58
    },
    bonusesPercentages: {
      first: 50,
      second: 30,
      third: 15
    },
    startTime: {
      start: 1541073600, // 2018-11-01 12:00 GMT+0
      second: 1543665600, // 2018-12-01 12:00 GMT+0
      third: 1544875200, // 2018-12-15 12:00 GMT+0
      end: 1546257600 // 2018-12-31 12:00 GMT+0
    }
  };
  const PHASES_INTERVALS = {
    firstToSecond: PHASES.startTime.second - PHASES.startTime.start,
    secondToThird: PHASES.startTime.third - PHASES.startTime.start,
    thirdToClose: PHASES.startTime.end - PHASES.startTime.start,
  }
  const RATE = new BigNumber(1061657);
  const GOAL = new BigNumber(200000);
  const CAP = new BigNumber(20120000);
  const TOTAL_SUPPLY = new BigNumber(ether(60000000));

  const LESS_THAN_SOFT_CAP_VALUE = 1;
  const LESS_THAN_HARD_CAP_VALUE = GOAL;
  const MORE_THEN_HARD_CAP_VALUE = CAP;
  const PAYMENTS = {
    lessThanSoftCap: {
      value: LESS_THAN_SOFT_CAP_VALUE,
      eth: ether(LESS_THAN_SOFT_CAP_VALUE),
      tokens: ether(
        LESS_THAN_SOFT_CAP_VALUE *
        PHASES.prices.first *
        (PHASES.bonusesPercentages.first + 100) / 100
      )
    },
    lessThanHardCap: {
      value: LESS_THAN_HARD_CAP_VALUE,
      eth: ether(LESS_THAN_HARD_CAP_VALUE),
      tokens: ether(
        LESS_THAN_HARD_CAP_VALUE *
        PHASES.prices.first *
        (PHASES.bonusesPercentages.first + 100) / 100
      )
    },
    moreThanHardCap: {
      value: MORE_THEN_HARD_CAP_VALUE,
      eth: ether(MORE_THEN_HARD_CAP_VALUE),
      tokens: ether(
        MORE_THEN_HARD_CAP_VALUE *
        PHASES.prices.first *
        (PHASES.bonusesPercentages.first + 100) / 100
      )
    }
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
      this.openingTime, this.closingTime, this.secondPhaseStartTime, this.thirdPhaseStartTime, RATE, wallet, this.token.address, GOAL, CAP, this.fiatContract.address
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
    const investmentAmount = ether(1);

    await increaseTimeTo(this.openingTime);
    await this.crowdsale.buyTokens(investor, { value: investmentAmount, from: investor }).should.be.rejectedWith(EVMRevert);
  });

  it('should accept payments during the sale when the investor is in the whitelist ', async function () {
    const investmentAmount = PAYMENTS.lessThanSoftCap.eth;
    const expectedTokenAmount = PAYMENTS.lessThanSoftCap.tokens;
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.buyTokens(investor, { value: investmentAmount, from: investor }).should.be.fulfilled;
    (await this.crowdsale.balances(investor)).should.be.bignumber.equal(expectedTokenAmount);
  });

  it('should reject payments after end', async function () {
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.send(ether(1)).should.be.rejectedWith(EVMRevert);
    await this.crowdsale.buyTokens(investor, { value: ether(1), from: investor }).should.be.rejectedWith(EVMRevert);
  });

  it('should allow finalization and transfer funds to wallet if the goal is reached', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.sendTransaction({ value: ether(GOAL), from: investor, gasPrice: 0 });
    const beforeFinalization = web3.eth.getBalance(wallet);
    await increaseTimeTo(this.afterDeliveryTime);
    await this.crowdsale.finalize({ from: owner });
    const afterFinalization = web3.eth.getBalance(wallet);

    afterFinalization.minus(beforeFinalization).should.be.bignumber.above(GOAL);
  });

  it('should allow refunds if the goal is not reached', async function () {
    const balanceBeforeInvestment = web3.eth.getBalance(investor);

    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });

    await this.crowdsale.sendTransaction({ value: ether(1), from: investor, gasPrice: 0 }).should.be.fulfilled;
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.finalize({ from: owner });
    await this.crowdsale.claimRefund({ from: investor, gasPrice: 0 }).should.be.fulfilled;

    const balanceAfterRefund = web3.eth.getBalance(investor);
    balanceBeforeInvestment.should.be.bignumber.equal(balanceAfterRefund);
  });

  it('should disable refunds if the goal is reached', async function () {
    const balanceBeforeInvestment = web3.eth.getBalance(investor);

    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });

    await this.crowdsale.sendTransaction({ value: PAYMENTS.lessThanHardCap.eth, from: investor, gasPrice: 0 }).should.be.fulfilled;
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.finalize({ from: owner });
    await this.crowdsale.claimRefund({ from: investor, gasPrice: 0 }).should.be.rejectedWith(EVMRevert);
  });

  it('should return current bonus according to first phase', async function () {
    await increaseTimeTo(this.openingTime);
    const bonus = await this.crowdsale.getCurrentBonusPercentage();
    bonus.should.be.bignumber.equal(PHASES.bonusesPercentages.first);
  });

  it('should return current bonus according to second phase', async function () {
    await increaseTimeTo(this.secondPhaseStartTime);
    const bonus = await this.crowdsale.getCurrentBonusPercentage();
    bonus.should.be.bignumber.equal(PHASES.bonusesPercentages.second);
  });

  it('should return current bonus according to third phase', async function () {
    await increaseTimeTo(this.thirdPhaseStartTime);
    const bonus = await this.crowdsale.getCurrentBonusPercentage();
    bonus.should.be.bignumber.equal(PHASES.bonusesPercentages.third);
  });

  it('should return current price in cents according to first phase', async function () {
    await increaseTimeTo(this.openingTime);
    const price = await this.crowdsale.getCurrentTokenPriceInCents();
    price.should.be.bignumber.equal(PHASES.prices.first);
  });

  it('should return current price in cents according to second phase', async function () {
    await increaseTimeTo(this.secondPhaseStartTime);
    const price = await this.crowdsale.getCurrentTokenPriceInCents();
    price.should.be.bignumber.equal(PHASES.prices.second);
  });

  it('should return current price in cents according to third phase', async function () {
    await increaseTimeTo(this.thirdPhaseStartTime);
    const price = await this.crowdsale.getCurrentTokenPriceInCents();
    price.should.be.bignumber.equal(PHASES.prices.third);
  });

  it('should reverts when trying to buy tokens when contract is paused', async function () {
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.pause({ from: owner });
    await assertRevert(this.crowdsale.sendTransaction({ from: investor, value: ether(1) }));
  });

  it('should update remaining tokens correctly according to first phase', async function () {
    await increaseTimeTo(this.openingTime);
    const totalPublicSupplyForCurrentPhase = await this.crowdsale.remainingPublicSupplyPerPhase(0);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    this.crowdsale.sendTransaction({ from: investor, value: ether(GOAL), gasPrice: 0 }).should.be.fulfilled;
    const rate = await this.fiatContract.USD(1);
    const bonus = await this.crowdsale.getCurrentBonusPercentage();
    const price = await this.crowdsale.getCurrentTokenPriceInCents();
    const expectedTokenAmount = ether(GOAL).mul(price).mul(bonus.add(100).div(100)).div(rate).mul(ether(1));
    const remainingPublicSupply = await this.crowdsale.remainingPublicSupplyPerPhase(0);
    remainingPublicSupply.add(expectedTokenAmount).should.be.bignumber.equal(totalPublicSupplyForCurrentPhase);
  });

  it('should update remaining tokens correctly according to second phase', async function () {
    await increaseTimeTo(this.secondPhaseStartTime);
    const totalPublicSupplyForCurrentPhase = await this.crowdsale.remainingPublicSupplyPerPhase(1);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    this.crowdsale.sendTransaction({ from: investor, value: ether(GOAL), gasPrice: 0 }).should.be.fulfilled;
    const rate = await this.fiatContract.USD(1);
    const bonus = await this.crowdsale.getCurrentBonusPercentage();
    const price = await this.crowdsale.getCurrentTokenPriceInCents();
    const expectedTokenAmount = ether(GOAL).mul(price).mul(bonus.add(100).div(100)).div(rate).mul(ether(1));
    const remainingPublicSupply = await this.crowdsale.remainingPublicSupplyPerPhase(1);
    remainingPublicSupply.add(expectedTokenAmount).should.be.bignumber.equal(totalPublicSupplyForCurrentPhase);
  });

  it('should update remaining tokens correctly according to third phase', async function () {
    await increaseTimeTo(this.thirdPhaseStartTime);
    const totalPublicSupplyForCurrentPhase = await this.crowdsale.remainingPublicSupplyPerPhase(2);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    this.crowdsale.sendTransaction({ from: investor, value: ether(GOAL), gasPrice: 0 }).should.be.fulfilled;
    const rate = await this.fiatContract.USD(1);
    const bonus = await this.crowdsale.getCurrentBonusPercentage();
    const price = await this.crowdsale.getCurrentTokenPriceInCents();
    const expectedTokenAmount = ether(GOAL).mul(price).mul(bonus.add(100).div(100)).div(rate).mul(ether(1));
    const remainingPublicSupply = await this.crowdsale.remainingPublicSupplyPerPhase(2);
    remainingPublicSupply.add(expectedTokenAmount).should.be.bignumber.equal(totalPublicSupplyForCurrentPhase);
  });

  it('should burn the remaining public tokens after finalization', async function () {
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.sendTransaction({ value: ether(1), from: investor, gasPrice: 0 }).should.be.fulfilled;
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.finalize({ from: owner });
    for (let i = 0; i < 3; i++) {
      (await this.crowdsale.remainingPublicSupplyPerPhase(i)).should.be.bignumber.equal(0);
    }
  });

  it('should not allow beneficiaries to withdraw tokens before delivery time', async function () {
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.sendTransaction({ value: PAYMENTS.lessThanHardCap.eth, from: investor, gasPrice: 0 });
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.withdrawTokens({ from: investor }).should.be.rejectedWith(EVMRevert);
  });

  it('should allow beneficiaries to withdraw tokens after delivery time', async function () {
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.sendTransaction({ value: PAYMENTS.lessThanHardCap.eth, from: investor, gasPrice: 0 });
    await increaseTimeTo(this.afterDeliveryTime);
    await this.crowdsale.withdrawTokens({ from: investor }).should.be.fulfilled;
  });

  it('should not allow beneficiaries to withdraw tokens if softcap was not reached', async function () {
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.sendTransaction({ value: PAYMENTS.lessThanSoftCap.eth, from: investor, gasPrice: 0 });
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.withdrawTokens({ from: investor }).should.be.rejectedWith(EVMRevert);
  });

  it('should return the amount of tokens bought', async function () {
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.sendTransaction({ value: PAYMENTS.lessThanHardCap.eth, from: investor, gasPrice: 0 });
    await increaseTimeTo(this.afterDeliveryTime);
    await this.crowdsale.withdrawTokens({ from: investor });
    const balance = await this.token.balanceOf(investor);
    balance.should.be.bignumber.equal(PAYMENTS.lessThanHardCap.tokens);
  });

  it('should not allow a second call to withdrawTokens', async function () {
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.sendTransaction({ value: PAYMENTS.lessThanHardCap.eth, from: investor, gasPrice: 0 });
    await increaseTimeTo(this.afterDeliveryTime);
    await this.crowdsale.withdrawTokens({ from: investor });
    await this.crowdsale.withdrawTokens({ from: investor }).should.be.rejectedWith(EVMRevert);
  });

  it('should transfer the ownership of the token back to the owner after finalization', async function () {
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await increaseTimeTo(this.openingTime);
    await this.crowdsale.sendTransaction({ value: PAYMENTS.lessThanSoftCap.eth, from: investor, gasPrice: 0 });
    const ownerBefore = await this.token.owner();
    ownerBefore.should.equal(this.crowdsale.address);
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.finalize({ from: owner });
    const ownerAfter = await this.token.owner();
    ownerAfter.should.equal(owner);
  });


  it('should not accept payments if hard cap is reached', async function () {
    await increaseTimeTo(this.openingTime);
    const investmentAmount = PAYMENTS.lessThanSoftCap.eth;
    const expectedTokenAmount = PAYMENTS.lessThanSoftCap.tokens;
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.buyTokens(investor, { value: investmentAmount, from: investor }).should.be.rejectedWith(EVMRevert);
  });

  it('should not accept payments if required tokens > hard cap', async function () {
    await increaseTimeTo(this.openingTime);
    const investmentAmount = PAYMENTS.moreThanHardCap.eth;
    const expectedTokenAmount = PAYMENTS.moreThanHardCap.tokens;
    await this.crowdsale.addToWhitelist(investor, { from: owner });
    await this.crowdsale.buyTokens(investor, { value: investmentAmount, from: investor }).should.be.rejectedWith(EVMRevert);
  });

  describe('Constructing', function () {

    it('should reverts when goal > cap', async function () {
      const HIGH_GOAL = ether(30);
      await assertRevert(CryptonityCrowdsale.new(
        this.openingTime, this.closingTime, this.secondPhaseStartTime, this.thirdPhaseStartTime, RATE, wallet, this.token.address, HIGH_GOAL, CAP, this.fiatContract.address
      ));
    });

    it('should reverts when openingTime > secondPhaseStartTime', async function () {
      const openingTime = this.secondPhaseStartTime + duration.hours(1);
      await assertRevert(CryptonityCrowdsale.new(
        openingTime, this.closingTime, this.secondPhaseStartTime, this.thirdPhaseStartTime, RATE, wallet, this.token.address, GOAL, CAP, this.fiatContract.address
      ));
    });

    it('should reverts when secondPhaseStartTime > thirdPhaseStartTime', async function () {
      const secondPhaseStartTime = this.thirdPhaseStartTime + duration.hours(1);
      await assertRevert(CryptonityCrowdsale.new(
        this.openingTime, this.closingTime, secondPhaseStartTime, this.thirdPhaseStartTime, RATE, wallet, this.token.address, GOAL, CAP, this.fiatContract.address
      ));
    });

    it('should reverts when thirdPhaseStartTime > closingTime', async function () {
      const thirdPhaseStartTime = this.closingTime + duration.hours(1);
      await assertRevert(CryptonityCrowdsale.new(
        this.openingTime, this.closingTime, this.secondPhaseStartTime, thirdPhaseStartTime, RATE, wallet, this.token.address, GOAL, CAP, this.fiatContract.address
      ));
    });

  });

});
