pragma solidity ^0.4.23;

/**
 * @title Fiat Contract Interface, defining one single function to get 0,01 $ price.
 * @dev Cryptonity Crowdsale
 **/
contract FiatContractInterface {
  function USD(uint _id) view public returns (uint256);
}