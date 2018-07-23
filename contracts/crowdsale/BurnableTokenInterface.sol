pragma solidity ^0.4.23;


/**
 * @title Burnable Token Interface, defining one single function to burn tokens.
 * @dev Cryptonity Crowdsale
 **/
contract BurnableTokenInterface {

  /**
  * @dev Burns a specific amount of tokens.
  * @param _value The amount of token to be burned.
  */
  function burn(uint256 _value) public;
}
