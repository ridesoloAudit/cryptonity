var CryptonityToken = artifacts.require("../contracts/cryptonity/token/CryptonityToken.sol");

module.exports = function(deployer) {
  deployer.deploy(CryptonityToken, { gas: 5000000 });
};
