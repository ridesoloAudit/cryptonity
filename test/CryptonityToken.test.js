
import assertRevert from 'openzeppelin-solidity/test/helpers/assertRevert';
const BigNumber = web3.BigNumber;
const CryptonityToken = artifacts.require('CryptonityToken.sol');

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('CryptonityToken', function (accounts) {
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  let cryptonityToken;
  const _owner = accounts[0];
  const _receiver = accounts[1];

  beforeEach('setup contract for each test', async function () {
    cryptonityToken = await CryptonityToken.new({ from: _owner });
  });

  describe('total supply', function () {
    it('returns the total amount of tokens', async function () {
      const instance = await CryptonityToken.deployed();
      const totalSupply = await instance.totalSupply();
      const expectedTotalSupply = 10000000 * 10e+18;
      totalSupply.should.be.bignumber.equal(expectedTotalSupply);
    });
  },

  describe('as a basic burnable token', function () {
    const amount = 1000;
    describe('when sender is not the owner', function () {
      it('reverts', async function () {
        await assertRevert(cryptonityToken.burn(1, { from: _receiver }));
      });
    });

    describe('when sender is the owner', function () {
      describe('when the given amount is not greater than balance of the sender', function () {
        let receipt;
        let initialBalance;

        beforeEach(async function () {
          initialBalance = await cryptonityToken.balanceOf(_owner);
          receipt = await cryptonityToken.burn(amount, { from: _owner });
        });

        it('burns the requested amount', async function () {
          const balance = await cryptonityToken.balanceOf(_owner);
          balance.should.be.bignumber.equal(initialBalance.sub(amount));
        });

        it('emits a burn event', async function () {
          const event = receipt.logs.find(e => e.event === 'Burn');
          event.args.burner.should.eq(_owner);
          event.args.value.should.be.bignumber.equal(amount);
        });

        it('emits a transfer event', async function () {
          const event = receipt.logs.find(e => e.event === 'Transfer');
          event.args.from.should.eq(_owner);
          event.args.to.should.eq(ZERO_ADDRESS);
          event.args.value.should.be.bignumber.equal(amount);
        });
      });

      describe('when the given amount is greater than the balance of the sender', function () {
        it('reverts', async function () {
          const currentBalance = await cryptonityToken.balanceOf(_owner);
          await assertRevert(cryptonityToken.burn(currentBalance.add(1), { from: _owner }));
        });
      });
    });
  }));
});
