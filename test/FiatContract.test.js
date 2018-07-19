const FiatContract = artifacts.require("./FiatContract.sol");
const CryptonityCrowdsale = artifacts.require("./CryptonityCrowdsale.sol");

let account_one;
let account_two;
let priceAddress;
let market;

contract('FiatContract', function(accounts) {

  account_one = accounts[1];
  account_two = accounts[2];

  it("should insert new ETH price", async function() {
    return await FiatContract.deployed().then(function(instance) {
        market = instance;
        priceAddress = instance.address;
      return market.update(0, "ETH", 1000000000000000000, 33652131190000, 40154176530000, 44664290720000);
    });
  });

  it("should get 0.01 USD worth of ETH", async function() {
    return await FiatContract.deployed().then(function(instance) {
      return instance.USD(0);
    }).then(function(amount) {
      assert.equal(amount, 33652131190000, "Ethereum USD Price was set correctly");
    });
  });

  it("should get 0.01 EURO worth of ETH", async function() {
    return await FiatContract.deployed().then(function(instance) {
      return market.EUR(0);
    }).then(function(amount) {
      assert.equal(amount, 40154176530000, "Ethereum EURO Price was set correctly");
    });
  });

  it("should get $105.75 USD worth of ETH", async function() {
    return await FiatContract.deployed().then(function(instance) {
      return market.USD(0);
    }).then(function(amount) {
      var dollars = amount * 10575;
      assert.equal(dollars, 355871287334250000, "Ethereum USD conversion is correct");
    });
  });

  it("should change Creator address", async function() {
    return await FiatContract.deployed().then(function(instance) {
      return market.changeCreator(account_two);
    }).then(function() {
      return market.creator.call();
    }).then(function(creator) {
      assert.equal(creator, account_two, "New Creator was set");
    });
  });

  it("should change Sender address", async function() {
    return await FiatContract.deployed().then(function(instance) {
      return market.changeSender(account_one);
    }).then(function() {
      return market.sender.call();
    }).then(function(sender) {
      assert.equal(sender, account_one, "New Sender was set");
    });
  });


  it("should delete EUR from tokens", async function() {
    return await FiatContract.deployed().then(function(instance) {
      return market.deleteToken(2);
    }).then(function(tx) {
      assert.equal(tx.logs[0].event, "DeletePrice", "Token was removed from contract");
    });
  });


  it("should donate to contract", async function() {
    return await FiatContract.deployed().then(function(instance) {
      return market.donate();
    }).then(function(tx) {
      assert.equal(tx.logs[0].event, "Donation", "Donation transfers ETH to wallet");
    });
  });


  it("should request to update price", async function() {
    return await FiatContract.deployed().then(function(instance) {
      return market.requestUpdate(0);
    }).then(function(tx) {
      assert.equal(tx.logs[0].event, "RequestUpdate", "Contract can request new updated price from call");
    });
  });


  it("should be FiatContract contract address", async function() {
	return await CryptonityCrowdsale.deployed().then(function(instance) {
	  return instance.PriceAddress.call()
	}).then(function(address) {
	  assert.equal(address, priceAddress, "CryptonityCrowdsale has FiatContract contract correct");
	});
  });

});