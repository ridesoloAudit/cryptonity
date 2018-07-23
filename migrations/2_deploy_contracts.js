const CryptonityToken = artifacts.require('CryptonityToken.sol');
const CryptonityCrowdsale = artifacts.require('CryptonityCrowdsale.sol');
const FiatContractMock = artifacts.require('FiatContractMock.sol');
const SafeMath = artifacts.require('SafeMath.sol');

module.exports = async function (deployer, network, accounts) {
  let openingTime;
  // owner of the crowdsale
  const owner = web3.eth.accounts[0];

  // wallet where the ehter will get deposited
  const wallet = web3.eth.accounts[2];

  const rate = new web3.BigNumber(1);
  const hardCapInUSD = new web3.BigNumber(20120000);
  const softCapInUSD = new web3.BigNumber(500000);

  const saleTokenPercentage = 0.6;

  if (network === 'ropsten') {
    openingTime = web3.eth.getBlock('latest').timestamp + 300; // five minutes in the future
  } else {
    openingTime = web3.eth.getBlock('latest').timestamp + 60; // thirty seconds in the future
  }

  const closingTime = openingTime + 86400 * 60; // 60 days

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
      start: openingTime, // 2018-11-01 12:00 GMT+0
      second: openingTime + 86400 * 30, // 2018-12-01 12:00 GMT+0
      third: openingTime + 86400 * 45, // 2018-12-15 12:00 GMT+0
      end: closingTime // 2018-12-31 12:00 GMT+0
    }
  };

  const ropstenFiatContractAddress = '0x2CDe56E5c8235D6360CCbb0c57Ce248Ca9C80909';
  let fiatContractAddress;

  console.log('openingTime: ' + openingTime);
  console.log('closingTime: ' + closingTime);

  console.log('Owner address: ' + owner);
  console.log('Wallet address: ' + wallet);

  return deployer.then(function () {
      // deploy SafeMath first
      return deployer.deploy(SafeMath);
    }).then(function () {
      // link SafeMath
      return deployer.link(
        SafeMath, [CryptonityToken, CryptonityCrowdsale]
      );
    }).then(function () {
      return deployer.deploy(
        CryptonityToken, {
          from: owner
        }
      );
    }).then(function () {
      if (network !== 'ropsten') {
        return deployer.deploy(
          FiatContractMock, {
            from: owner
          }
        );
      }
    }).then(function () {
      fiatContractAddress = FiatContractMock || ropstenFiatContractAddress;
    }).then(function () {
      return deployer.deploy(
        CryptonityCrowdsale,
        openingTime,
        closingTime,
        PHASES.startTime.second,
        PHASES.startTime.third,
        rate,
        wallet,
        CryptonityToken.address,
        softCapInUSD,
        hardCapInUSD,
        FiatContractMock.address || fiatContractAddress,
        { from: owner }
      );
    }).then(function () {
      return (CryptonityToken.at(CryptonityToken.address)).transferOwnership(
        CryptonityCrowdsale.address,
        { from: owner }
      );
    }).then(function () {
      return (CryptonityToken.at(CryptonityToken.address)).totalSupply();
    }).then(function (totalSupply) {
      return (CryptonityToken.at(CryptonityToken.address)).transfer(
        CryptonityCrowdsale.address,
        totalSupply * saleTokenPercentage,
        { from: owner }
      );
    });

};
