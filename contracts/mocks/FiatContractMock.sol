pragma solidity ^0.4.23;

contract FiatContractMock {

  uint256 priceUSD = 1e18;

  // returns 0.01 value in USD
  function USD(uint _id) view public returns (uint256) {
    return priceUSD;
  }

  // update value in USD
  function update(uint256 _newPrice) external {
    priceUSD = _newPrice;
  }

}