import ether from 'openzeppelin-solidity/test/helpers/ether';
import { advanceBlock } from 'openzeppelin-solidity/test/helpers/advanceToBlock';
import { increaseTimeTo, duration } from 'openzeppelin-solidity/test/helpers/increaseTime';
import latestTime from 'openzeppelin-solidity/test/helpers/latestTime';
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';
import assertRevert from 'openzeppelin-solidity/test/helpers/assertRevert';
const FiatContract = artifacts.require('FiatContract');
const CryptonityCrowdsale = artifacts.require('CryptonityCrowdsale');
const CryptonityToken = artifacts.require('CryptonityToken');
const RefundVault = artifacts.require('RefundVault');

const BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('CryptonityCrowdsale', function ([owner, wallet, investor]) {
  const RATE = new BigNumber(10);
  const GOAL = ether(10);
  const CAP = ether(20);
  const FIAT_CONTRACT_ADDRESS = 0x8055d0504666e2B6942BeB8D6014c964658Ca591;

  before(async function () {
    // Advance to the next block to correctly read time in the solidity "now" function interpreted by ganache
    await advanceBlock();
  });

  beforeEach(async function () {
    this.openingTime = latestTime() + duration.weeks(1);
    this.closingTime = this.openingTime + duration.weeks(1);
    this.afterClosingTime = this.closingTime + duration.seconds(1);
    this.token = await CryptonityToken.new({ from: owner });
    this.vault = await RefundVault.new(wallet, { from: owner });
    this.crowdsale = await CryptonityCrowdsale.new(
      this.openingTime, this.closingTime, RATE, wallet, this.token.address, GOAL, CAP, FIAT_CONTRACT_ADDRESS
    );
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
    await this.crowdsale.send(ether(1)).should.be.rejectedWith(EVMRevert);
    await this.crowdsale.buyTokens(investor, { from: investor, value: ether(1) }).should.be.rejectedWith(EVMRevert);
  });

  it('should reject payments after end', async function () {
    await increaseTimeTo(this.afterClosingTime);
    await this.crowdsale.send(ether(1)).should.be.rejectedWith(EVMRevert);
    await this.crowdsale.buyTokens(investor, { value: ether(1), from: investor }).should.be.rejectedWith(EVMRevert);
  });

  describe('when goal > cap', function () {
    // goal > cap
    const HIGH_GOAL = ether(30);

    it('creation reverts', async function () {
      await assertRevert(CryptonityCrowdsale.new(
        this.openingTime,
        this.closingTime,
        RATE, wallet,
        this.token.address, 
        HIGH_GOAL, CAP, 
        FIAT_CONTRACT_ADDRESS
      ));
    });
  });

  describe('fiat contract', function () {
    it('should create fiat contract address', async function () {
      const openingTime = await this.crowdsale.openingTime();
      const closingTime = await this.crowdsale.closingTime();
      const rate = await this.crowdsale.rate();
      const walletAddress = await this.crowdsale.wallet();
      const token = await this.crowdsale.token();
      const goal = await this.crowdsale.goal();
      const cap = await this.crowdsale.cap();
      const fiatContract = await this.crowdsale.price();
      this.crowdsale = await CryptonityCrowdsale.new(
        openingTime,
        closingTime,
        rate,
        walletAddress,
        token,
        goal,
        cap,
        fiatContract
      );

      await this.crowdsale.OneWEIUSD().should.be.equal(this.crowdsale.price());
    });
  });
});
